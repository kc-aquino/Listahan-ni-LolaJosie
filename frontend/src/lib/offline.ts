import type { Customer, CustomerPayment, DebtTransaction, Paginated } from './api'
import type { DebtInput, PaymentInput, PendingEntry } from './offlineModel'
import { draftDebt, ledgerBalances, projectLedger, validatePayment } from './offlineModel'
import { changeOfflineState, readOfflineState } from './offlineStore'

export function offlineIdentity() {
  if (typeof window === 'undefined') return null
  try {
    const user = JSON.parse(localStorage.getItem('lista-ni-lola-user') ?? sessionStorage.getItem('lista-ni-lola-user') ?? 'null')
    const token = localStorage.getItem('lista-ni-lola-token') ?? sessionStorage.getItem('lista-ni-lola-token')
    return user?.id && token ? { userId: String(user.id), token: String(token) } : null
  } catch { return null }
}
export async function rememberResponse(path: string, value: unknown) {
  const identity = offlineIdentity()
  if (!identity || typeof indexedDB === 'undefined') return
  await changeOfflineState(identity.userId, (state) => { (state.responses ??= {})[path] = value }, false)
}

export async function localResponse(path: string, force = false): Promise<unknown | undefined> {
  const identity = offlineIdentity()
  if (!identity || typeof indexedDB === 'undefined') return undefined
  const state = await readOfflineState(identity.userId)
  if (!force && !state.entries.length) return undefined
  if (!state.snapshot) return undefined
  const url = new URL(path, 'https://offline.local')
  const view = projectLedger(state)
  const page = <T,>(data: T[]) => {
    const index = Number(url.searchParams.get('page') ?? 1)
    const size = Number(url.searchParams.get('pageSize') ?? 100)
    return { data: data.slice((index - 1) * size, index * size), pagination: { page: index, pageSize: size, totalItems: data.length, totalPages: Math.ceil(data.length / size) } }
  }
  if (url.pathname === '/customers') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    return page(view.customers.filter((customer) => (url.searchParams.get('includeArchived') === 'true' || !customer.archivedAt) && customer.name.toLowerCase().includes(q)))
  }
  const match = /^\/customers\/([^/]+)(?:\/(balances|transactions|payments))?$/.exec(url.pathname)
  if (match) {
    const [, id, section] = match
    if (!section) return view.customers.find((customer) => customer.id === id)
    if (section === 'transactions') return page(view.debts.filter((debt) => debt.customerId === id))
    if (section === 'payments') return page(view.payments.filter((payment) => payment.customerId === id))
    return { customerId: id, ...ledgerBalances(view.debts, id), asOf: state.snapshot.capturedAt }
  }
  if (url.pathname === '/reports/summary') return { ...ledgerBalances(view.debts), asOf: state.snapshot.capturedAt }
  if (url.pathname === '/reports/customers') return { ...page(view.customers.filter((customer) => !customer.archivedAt).map((customer) => ({ id: customer.id, name: customer.name, contactNumber: customer.contactNumber, ...ledgerBalances(view.debts, customer.id) }))), asOf: state.snapshot.capturedAt }
  return state.responses?.[path]
}

export async function enqueueEntry(customerId: string, kind: 'debt' | 'payment', body: DebtInput | PaymentInput, key: string) {
  const identity = offlineIdentity()
  if (!identity) throw new Error('Sign in online once before using offline records.')
  if (navigator.onLine && !(await readOfflineState(identity.userId)).snapshot?.customers.some((customer) => customer.id === customerId)) {
    await syncOfflineLedger()
    if (!(await readOfflineState(identity.userId)).snapshot?.customers.some((customer) => customer.id === customerId)) await syncOfflineLedger()
  }
  const entry: PendingEntry = { id: `local:${key}`, customerId, kind, key, createdAt: new Date().toISOString(), body: structuredClone(body) }
  if (kind === 'debt') (entry.body as DebtInput).occurredAt ??= entry.createdAt
  else (entry.body as PaymentInput).paidAt ??= entry.createdAt
  await changeOfflineState(identity.userId, (state) => {
    const existing = state.entries.find((entry) => entry.key === key)
    if (existing) return
    const customer = state.snapshot?.customers.find((customer) => customer.id === customerId)
    if (!customer) throw new Error('Open this customer while online before recording offline entries.')
    if (kind === 'debt') {
      if (customer.archivedAt) throw new Error('Restore this customer online before adding debt.')
      draftDebt(entry)
    } else validatePayment(state, customerId, entry.body as PaymentInput)
    state.entries.push(entry)
  })
  // Only resolve after IndexedDB confirms the write. No optimistic success on storage failure.
  return kind === 'debt' ? draftDebt(entry) : { id: entry.id, syncStatus: 'PENDING' }
}

class SyncError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status } }
async function remote<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } })
  if (!response.ok) {
    let message = `Sync failed (${response.status}).`
    try { const result = await response.json(); message = Array.isArray(result.message) ? result.message.join(' ') : result.message ?? message } catch { /* retain status */ }
    throw new SyncError(message, response.status)
  }
  return response.json() as Promise<T>
}
async function all<T>(path: string, token: string) {
  const data: T[] = []
  for (let page = 1; ; page++) {
    const result = await remote<Paginated<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`, token)
    data.push(...result.data)
    if (page >= result.pagination.totalPages) return data
  }
}
const running = new Map<string, Promise<void>>()
export function syncOfflineLedger(): Promise<void> {
  const identity = offlineIdentity()
  if (!identity || !navigator.onLine) return Promise.resolve()
  const existing = running.get(identity.userId)
  if (existing) return existing
  const run = async () => {
    const { userId, token } = identity
    try {
      const initial = await readOfflineState(userId)
      for (const original of initial.entries) {
        const state = await readOfflineState(userId)
        const entry = state.entries.find((entry) => entry.id === original.id)
        if (!entry || entry.receipt) continue
        if (entry.rejected) throw new Error(entry.error || 'Review the entry that could not sync.')
        if (offlineIdentity()?.userId !== userId || !navigator.onLine) return
        let body = structuredClone(entry.body)
        if (entry.kind === 'payment') body = { ...body as PaymentInput, allocations: (body as PaymentInput).allocations.map((allocation) => ({ ...allocation, transactionId: state.mappings[allocation.transactionId] ?? allocation.transactionId })) }
        if (entry.kind === 'payment' && (body as PaymentInput).allocations.some((allocation) => allocation.transactionId.startsWith('local:'))) throw new Error('The related debt must sync before this payment.')
        await changeOfflineState(userId, (current) => { const found = current.entries.find((item) => item.id === entry.id); if (found) found.attempted = true })
        try {
          const result = await remote<{ id: string }>(`/customers/${entry.customerId}/${entry.kind === 'debt' ? 'transactions' : 'payments'}`, token, { method: 'POST', headers: { 'Idempotency-Key': entry.key }, body: JSON.stringify(body) })
          await changeOfflineState(userId, (current) => {
            const found = current.entries.find((item) => item.id === entry.id)
            if (found) { found.receipt = { id: result.id }; delete found.error; delete found.rejected }
            current.mappings[entry.id] = result.id
          })
        } catch (error) {
          await changeOfflineState(userId, (current) => {
            const found = current.entries.find((item) => item.id === entry.id)
            if (found) {
              found.error = error instanceof Error ? error.message : 'Could not sync.'
              found.rejected = error instanceof SyncError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429
            }
          })
          throw error
        }
      }
      // Fetch a complete, consistent replacement before removing acknowledged entries.
      const acknowledged = (await readOfflineState(userId)).entries.filter((entry) => entry.receipt).map((entry) => entry.id)
      const customers = await all<Customer>('/customers?includeArchived=true', token)
      const debts: DebtTransaction[] = []
      const payments: (CustomerPayment & { customerId: string })[] = []
      for (const customer of customers) {
        if (offlineIdentity()?.userId !== userId) return
        const [customerDebts, customerPayments] = await Promise.all([all<DebtTransaction>(`/customers/${customer.id}/transactions`, token), all<CustomerPayment>(`/customers/${customer.id}/payments`, token)])
        debts.push(...customerDebts)
        payments.push(...customerPayments.map((payment) => ({ ...payment, customerId: customer.id })))
      }
      await changeOfflineState(userId, (current) => {
        current.snapshot = { customers, debts, payments, capturedAt: new Date().toISOString() }
        current.entries = current.entries.filter((entry) => !acknowledged.includes(entry.id))
      })
    } catch (error) {
      if (error instanceof SyncError && error.status === 401 && offlineIdentity()?.userId === identity.userId) window.dispatchEvent(new Event('lista-ni-lola:unauthorized'))
      throw error
    }
  }
  const locked = () => navigator.locks ? navigator.locks.request(`lista-sync-${identity.userId}`, run) : run()
  const promise = locked().finally(() => running.delete(identity.userId))
  running.set(identity.userId, promise)
  return promise
}

export async function retryEntry(id: string) {
  const identity = offlineIdentity(); if (!identity) return
  await changeOfflineState(identity.userId, (state) => { const entry = state.entries.find((entry) => entry.id === id); if (entry) { delete entry.error; delete entry.rejected } })
}
export async function discardEntry(id: string) {
  const identity = offlineIdentity(); if (!identity) return
  await changeOfflineState(identity.userId, (state) => {
    const entry = state.entries.find((entry) => entry.id === id)
    if (!entry || entry.receipt || (entry.attempted && !entry.rejected)) throw new Error('This entry may already be saved on the server. Reconnect to confirm it.')
    if (state.entries.some((other) => other.kind === 'payment' && (other.body as PaymentInput).allocations.some((allocation) => allocation.transactionId === id))) throw new Error('Remove the pending payment for this debt first.')
    state.entries = state.entries.filter((entry) => entry.id !== id)
  })
}


// Online writes use the API normally. Only disconnected/uncertain deliveries
// enter the durable outbox, preserving the exact payload and key for replay.
const preparedWrites = new Map<string, DebtInput | PaymentInput>()
export async function saveLedgerEntry(customerId: string, kind: 'debt' | 'payment', input: DebtInput | PaymentInput, key: string) {
  const identity = offlineIdentity()
  if (!identity) throw new Error('Sign in before saving records.')
  const fingerprint = `${identity.userId}:${key}`
  let body = preparedWrites.get(fingerprint)
  if (!body) {
    body = structuredClone(input)
    const timestamp = new Date().toISOString()
    if (kind === 'debt') (body as DebtInput).occurredAt ??= timestamp
    else (body as PaymentInput).paidAt ??= timestamp
    preparedWrites.set(fingerprint, body)
  }
  const queue = async () => {
    const result = await enqueueEntry(customerId, kind, body!, key)
    window.dispatchEvent(new Event('lista:sync-request'))
    return result
  }
  if (!navigator.onLine) return queue()
  try {
    const hasPending = typeof indexedDB !== 'undefined' && await readOfflineState(identity.userId).then((state) => state.entries.length > 0).catch(() => false)
    if (hasPending) await syncOfflineLedger()
    if (kind === 'payment' && typeof indexedDB !== 'undefined') {
      const state = await readOfflineState(identity.userId).catch(() => null)
      body = { ...body as PaymentInput, allocations: (body as PaymentInput).allocations.map((allocation) => ({ ...allocation, transactionId: state?.mappings[allocation.transactionId] ?? allocation.transactionId })) }
      preparedWrites.set(fingerprint, body)
    }
    const result = await remote<DebtTransaction | CustomerPayment>(`/customers/${customerId}/${kind === 'debt' ? 'transactions' : 'payments'}`, identity.token, {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body),
    })
    // Refresh the offline copy after any snapshot refresh already in flight.
    const previous = running.get(identity.userId)
    if (previous) void previous.catch(() => {}).then(() => syncOfflineLedger()).catch(() => {})
    else void syncOfflineLedger().catch(() => {})
    return result
  } catch (error) {
    if (error instanceof SyncError && error.status === 401) window.dispatchEvent(new Event('lista-ni-lola:unauthorized'))
    const uncertain = error instanceof TypeError || error instanceof SyntaxError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) || (error instanceof SyncError && (error.status >= 500 || [408, 429].includes(error.status)))
    if (uncertain || !navigator.onLine) return queue()
    throw error
  }
}
