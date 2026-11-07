import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allocateAcrossDebts } from '../src/lib/paymentAllocation'
import type { DebtTransaction } from '../src/lib/api'

const debt = (id: string, totalAmount: string, occurredAt: string, extra: Partial<DebtTransaction> = {}): DebtTransaction => ({
  id, totalAmount, occurredAt, customerId: 'customer', type: 'MONEY_LOAN', entryMode: null,
  status: 'ACTIVE', description: null, items: [], ...extra,
})
const debts = [
  debt('new', '20.25', '2026-11-08', { type: 'STORE_ITEMS' }),
  debt('old', '10.50', '2026-11-01', { allocations: [{ allocatedAmount: '5.00' }] }),
  debt('void', '99.00', '2026-10-01', { status: 'VOIDED' }),
  debt('paid', '10.00', '2026-10-02', { allocations: [{ allocatedAmount: '10.00' }] }),
]
test('partial payment pays oldest remaining balance before the next category', () => {
  assert.deepEqual(allocateAcrossDebts(debts, '7.75'), [
    { transactionId: 'old', allocatedAmount: '5.50' },
    { transactionId: 'new', allocatedAmount: '2.25' },
  ])
})
test('full payment and overpayment never allocate more than outstanding', () => {
  for (const amount of ['25.75', '100.00']) assert.deepEqual(allocateAcrossDebts(debts, amount), [
    { transactionId: 'old', allocatedAmount: '5.50' },
    { transactionId: 'new', allocatedAmount: '20.25' },
  ])
})
test('invalid and zero payments allocate nothing', () => {
  for (const amount of ['', '-1', 'abc', '1e3', '0.00']) assert.deepEqual(allocateAcrossDebts(debts, amount), [])
})
