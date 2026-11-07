import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDebtCompleted } from '../src/lib/money'

test('a fully paid active debt displays as completed and reopens after payment reversal', () => {
  const debt = { status: 'ACTIVE', totalAmount: '100.00', allocations: [{ allocatedAmount: '100.00' }] }
  assert.equal(isDebtCompleted(debt), true)
  assert.equal(isDebtCompleted({ ...debt, allocations: [{ allocatedAmount: '40.00' }] }), false)
  assert.equal(isDebtCompleted({ ...debt, allocations: [] }), false)
})
test('voided, reversed, and invalid debts are not marked completed', () => {
  for (const status of ['VOIDED', 'REVERSED']) assert.equal(isDebtCompleted({ status, totalAmount: '0.00' }), false)
  assert.equal(isDebtCompleted({ status: 'ACTIVE', totalAmount: 'invalid' }), false)
})
