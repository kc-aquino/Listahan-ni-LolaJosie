import type { DebtTransaction } from './api'
import { formatMinorUnits, outstandingAmount, toMinorUnits } from './money'

/** Apply a payment to the oldest outstanding debts, preserving exact cent amounts. */
export function allocateAcrossDebts(debts: DebtTransaction[], amount: string) {
  let remaining = toMinorUnits(amount) ?? 0n
  return [...debts]
    .filter((debt) => debt.status === 'ACTIVE')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .flatMap((debt) => {
      const balance = toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n
      if (balance <= 0n || remaining <= 0n) return []
      const applied = remaining < balance ? remaining : balance
      remaining -= applied
      return [{ transactionId: debt.id, allocatedAmount: formatMinorUnits(applied) }]
    })
}
