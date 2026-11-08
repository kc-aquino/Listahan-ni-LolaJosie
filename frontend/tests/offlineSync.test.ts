import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { changeOfflineState, readOfflineState } from '../src/lib/offlineStore'
import { discardEntry, enqueueEntry, localResponse, saveLedgerEntry, syncOfflineLedger } from '../src/lib/offline'
import { emptyState, ledgerBalances, projectLedger } from '../src/lib/offlineModel'
import type { LedgerSnapshot, PaymentInput } from '../src/lib/offlineModel'
import type { Customer, DebtTransaction } from '../src/lib/api'

const storage = () => {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
const local = storage(), session = storage()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session })
const target = Object.assign(new EventTarget(), { localStorage: local, sessionStorage: session })
Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
let online = false
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online } } })
const customer: Customer = { id: 'customer', name: 'Test customer', contactNumber: null, notes: null, archivedAt: null, createdAt: '2026-11-08', updatedAt: '2026-11-08' }
const debt: DebtTransaction = { id: 'existing', customerId: customer.id, type: 'MONEY_LOAN', entryMode: null, totalAmount: '100.00', status: 'ACTIVE', description: null, occurredAt: '2026-11-01', items: [], allocations: [] }
const seed = (): LedgerSnapshot => ({ customers: [customer], debts: [structuredClone(debt)], payments: [], capturedAt: '2026-11-08T00:00:00Z' })
const page = (data: unknown[]) => ({ data, pagination: { page: 1, pageSize: 100, totalItems: data.length, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(async () => {
  online = false
  local.setItem('lista-ni-lola-user', JSON.stringify({ id: 'owner' }))
  local.setItem('lista-ni-lola-token', 'test-token')
  await changeOfflineState('owner', (state) => Object.assign(state, emptyState(), { snapshot: seed() }))
})

test('offline entries survive a fresh read and update local balances, including payment to a new debt', async () => {
  await enqueueEntry('customer', 'debt', { type: 'STORE_ITEMS', entryMode: 'ITEMIZED', items: [{ itemName: 'Rice', quantity: '2', unitPrice: '10.00' }] }, 'new-debt')
  await enqueueEntry('customer', 'payment', { amount: '70.00', allocations: [{ transactionId: 'existing', allocatedAmount: '50.00' }, { transactionId: 'local:new-debt', allocatedAmount: '20.00' }] }, 'new-payment')
  const saved = await readOfflineState('owner')
  assert.equal(saved.entries.length, 2)
  assert.deepEqual(ledgerBalances(projectLedger(saved).debts), { moneyLoan: '50.00', storeItems: '0.00', combined: '50.00' })
  const balances = await localResponse('/customers/customer/balances', true) as { combined: string }
  assert.equal(balances.combined, '50.00')
  await assert.rejects(discardEntry('local:new-debt'), /pending payment/)
})

test('lost response retries the same key, remaps debt IDs, then atomically refreshes and clears the queue', async () => {
  await enqueueEntry('customer', 'debt', { type: 'STORE_ITEMS', entryMode: 'TOTAL_ONLY', totalAmount: '20.00' }, 'key-debt')
  await enqueueEntry('customer', 'payment', { amount: '20.00', allocations: [{ transactionId: 'local:key-debt', allocatedAmount: '20.00' }] }, 'key-payment')
  const server = seed()
  const receipts = new Map<string, unknown>()
  const attempts: string[] = []
  let loseResponse = true
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    if (init?.method === 'POST') {
      const key = new Headers(init.headers).get('Idempotency-Key')!
      attempts.push(key)
      if (receipts.has(key)) return json(receipts.get(key))
      const body = JSON.parse(String(init.body))
      if (path.endsWith('/transactions')) {
        const created = { ...debt, id: 'server-debt', type: 'STORE_ITEMS' as const, totalAmount: body.totalAmount, allocations: [] }
        server.debts.push(created); receipts.set(key, created)
        if (loseResponse) { loseResponse = false; throw new TypeError('Response lost after commit') }
        return json(created)
      }
      assert.equal(body.allocations[0].transactionId, 'server-debt')
      server.debts.find((entry) => entry.id === 'server-debt')!.allocations!.push({ allocatedAmount: '20.00' })
      const payment = { id: 'server-payment', customerId: 'customer', amount: '20.00', paymentMethod: null, notes: null, status: 'POSTED' as const, paidAt: body.paidAt, allocations: body.allocations }
      server.payments.push(payment); receipts.set(key, payment); return json(payment)
    }
    if (path.startsWith('/api/customers?')) return json(page(server.customers))
    if (path.includes('/transactions?')) return json(page(server.debts))
    if (path.includes('/payments?')) return json(page(server.payments))
    throw new Error(`Unexpected path ${path}`)
  }
  online = true
  await assert.rejects(syncOfflineLedger(), /Response lost/)
  assert.equal((await readOfflineState('owner')).entries.length, 2)
  await syncOfflineLedger()
  const saved = await readOfflineState('owner')
  assert.equal(saved.entries.length, 0)
  assert.deepEqual(attempts, ['key-debt', 'key-debt', 'key-payment'])
  assert.equal(server.debts.length, 2)
  assert.equal(saved.mappings['local:key-debt'], 'server-debt')
  assert.equal(ledgerBalances(projectLedger(saved).debts).combined, '100.00')
})

test('server rejection stays visible, blocks later writes, and can be removed without losing other entries', async () => {
  await enqueueEntry('customer', 'payment', { amount: '80.00', allocations: [{ transactionId: 'existing', allocatedAmount: '80.00' }] }, 'conflict')
  globalThis.fetch = async () => json({ message: 'Balance changed on another device.' }, 400)
  online = true
  await assert.rejects(syncOfflineLedger(), /Balance changed/)
  let saved = await readOfflineState('owner')
  assert.equal(saved.entries[0].rejected, true)
  assert.match(saved.entries[0].error!, /Balance changed/)
  await discardEntry('local:conflict')
  saved = await readOfflineState('owner')
  assert.equal(saved.entries.length, 0)
  assert.equal(saved.snapshot?.debts[0].totalAmount, '100.00')
})

test('a different owner cannot read another owner’s cached records or queue', async () => {
  await enqueueEntry('customer', 'debt', { type: 'MONEY_LOAN', totalAmount: '10.00' }, 'private-entry')
  local.setItem('lista-ni-lola-user', JSON.stringify({ id: 'other-owner' }))
  assert.equal(await localResponse('/customers/customer/balances', true), undefined)
  assert.equal((await readOfflineState('other-owner')).entries.length, 0)
})

test('payments cannot over-allocate the saved balance, including previous pending payments', async () => {
  const payment: PaymentInput = { amount: '70.00', allocations: [{ transactionId: 'existing', allocatedAmount: '70.00' }] }
  await enqueueEntry('customer', 'payment', payment, 'first')
  await assert.rejects(enqueueEntry('customer', 'payment', payment, 'second'), /exceeds/)
  assert.equal((await readOfflineState('owner')).entries.length, 1)
})


test('acknowledged writes are not resent if refreshing the snapshot fails', async () => {
  await enqueueEntry('customer', 'debt', { type: 'MONEY_LOAN', totalAmount: '15.00' }, 'ack-key')
  let posts = 0, failRefresh = true
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'POST') { posts++; return json({ ...debt, id: 'ack-server', totalAmount: '15.00' }) }
    if (failRefresh) throw new TypeError('Network lost during refresh')
    const path = String(input)
    if (path.startsWith('/api/customers?')) return json(page([customer]))
    if (path.includes('/transactions?')) return json(page([debt, { ...debt, id: 'ack-server', totalAmount: '15.00' }]))
    return json(page([]))
  }
  online = true
  await assert.rejects(syncOfflineLedger(), /Network lost/)
  let saved = await readOfflineState('owner')
  assert.equal(saved.entries[0].receipt?.id, 'ack-server')
  assert.equal(ledgerBalances(projectLedger(saved).debts).combined, '115.00')
  failRefresh = false
  await syncOfflineLedger()
  saved = await readOfflineState('owner')
  assert.equal(posts, 1)
  assert.equal(saved.entries.length, 0)
  assert.equal(ledgerBalances(projectLedger(saved).debts).combined, '115.00')
})


test('connected saves go directly to the server without creating pending entries', async () => {
  online = true
  let posts = 0
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'POST') { posts++; return json({ ...debt, id: 'online-server-id', totalAmount: '25.00' }) }
    const path = String(input)
    if (path.startsWith('/api/customers?')) return json(page([customer]))
    if (path.includes('/transactions?')) return json(page([debt]))
    return json(page([]))
  }
  const result = await saveLedgerEntry('customer', 'debt', { type: 'MONEY_LOAN', totalAmount: '25.00' }, 'direct-online')
  assert.equal(result.id, 'online-server-id')
  assert.equal((await readOfflineState('owner')).entries.length, 0)
  await syncOfflineLedger()
  assert.equal(posts, 1)
})

test('a failed online delivery becomes a local entry with the exact original timestamp and key', async () => {
  online = true
  let sent: Record<string, unknown> = {}
  globalThis.fetch = async (_input, init) => { sent = JSON.parse(String(init?.body)); throw new TypeError('Connection dropped') }
  const result = await saveLedgerEntry('customer', 'debt', { type: 'MONEY_LOAN', totalAmount: '30.00' }, 'dropped-online')
  assert.equal(result.id, 'local:dropped-online')
  const saved = await readOfflineState('owner')
  assert.equal(saved.entries.length, 1)
  assert.equal(saved.entries[0].key, 'dropped-online')
  assert.deepEqual(saved.entries[0].body, sent)
})

test('online validation errors are shown immediately rather than queued', async () => {
  online = true
  globalThis.fetch = async () => json({ message: 'Customer is archived.' }, 409)
  await assert.rejects(saveLedgerEntry('customer', 'debt', { type: 'MONEY_LOAN', totalAmount: '30.00' }, 'rejected-online'), /Customer is archived/)
  assert.equal((await readOfflineState('owner')).entries.length, 0)
})


test('online payments resolve a debt ID that was created offline and has since synced', async () => {
  await changeOfflineState('owner', (state) => { state.mappings['local:already-synced'] = 'existing' })
  online = true
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.allocations[0].transactionId, 'existing')
      return json({ id: 'online-payment' })
    }
    const path = String(input)
    if (path.startsWith('/api/customers?')) return json(page([customer]))
    return json(page([]))
  }
  const result = await saveLedgerEntry('customer', 'payment', { amount: '5.00', allocations: [{ transactionId: 'local:already-synced', allocatedAmount: '5.00' }] }, 'mapped-online-payment')
  assert.equal(result.id, 'online-payment')
  await syncOfflineLedger()
})
