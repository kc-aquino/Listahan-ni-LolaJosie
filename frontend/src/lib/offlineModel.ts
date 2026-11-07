import type { Customer, CustomerPayment, DebtTransaction } from './api'
import { formatMinorUnits, outstandingAmount, toMinorUnits } from './money'

export type DebtInput = { type: 'MONEY_LOAN' | 'STORE_ITEMS'; entryMode?: 'TOTAL_ONLY' | 'ITEMIZED'; totalAmount?: string; items?: { itemName: string; quantity: string; unitPrice: string }[]; description?: string; occurredAt?: string }
export type PaymentInput = { amount: string; paymentMethod?: string; notes?: string; allocations: { transactionId: string; allocatedAmount: string }[]; paidAt?: string }
export type PendingEntry = {
  id: string; customerId: string; kind: 'debt' | 'payment'; key: string;
  body: DebtInput | PaymentInput; createdAt: string; error?: string;
  // Acknowledgments survive a crash between server acceptance and snapshot refresh.
  receipt?: { id: string }; attempted?: boolean; rejected?: boolean;
}
export type LedgerSnapshot = { customers: Customer[]; debts: DebtTransaction[]; payments: (CustomerPayment & { customerId: string })[]; capturedAt: string }
export type OfflineState = { snapshot?: LedgerSnapshot; entries: PendingEntry[]; mappings: Record<string, string>; responses?: Record<string, unknown> }
export const emptyState = (): OfflineState => ({ entries: [], mappings: {} })

export function draftDebt(entry: PendingEntry): DebtTransaction {
  const body = entry.body as DebtInput
  const items = (body.items ?? []).map((item, index) => {
    if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(item.quantity)) throw new Error('Invalid quantity.')
    const [whole, fraction = ''] = item.quantity.split('.')
    const quantity = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))
    const price = toMinorUnits(item.unitPrice)
    if (quantity <= 0n || price === null || !item.itemName.trim()) throw new Error('Invalid item.')
    return { ...item, id: `${entry.id}-${index}`, subtotal: formatMinorUnits((quantity * price + 500n) / 1000n) }
  })
  const total = body.entryMode === 'ITEMIZED' ? items.reduce((sum, item) => sum + (toMinorUnits(item.subtotal) ?? 0n), 0n) : toMinorUnits(body.totalAmount ?? '')
  if (total === null || total <= 0n) throw new Error('Debt amount must be positive.')
  return { syncStatus: 'PENDING', id: entry.id, customerId: entry.customerId, type: body.type, entryMode: body.entryMode ?? null, totalAmount: formatMinorUnits(total), status: 'ACTIVE', description: body.description ?? null, occurredAt: body.occurredAt ?? entry.createdAt, items, allocations: [] }
}

export function projectLedger(state: OfflineState) {
  const debts = structuredClone(state.snapshot?.debts ?? [])
  const payments = structuredClone(state.snapshot?.payments ?? [])
  for (const entry of state.entries) {
    if (entry.kind === 'debt') debts.unshift(draftDebt(entry))
    else {
      const body = entry.body as PaymentInput
      const allocations = body.allocations.map((allocation) => {
        const debt = debts.find((debt) => debt.id === allocation.transactionId || debt.id === state.mappings[allocation.transactionId])
        if (debt) { (debt.allocations ??= []).push({ allocatedAmount: allocation.allocatedAmount }); debt.syncStatus = 'PENDING' }
        return { ...allocation, transactionId: debt?.id ?? allocation.transactionId, ...(debt ? { transaction: { type: debt.type } } : {}) }
      })
      payments.unshift({ syncStatus: 'PENDING', id: entry.id, customerId: entry.customerId, amount: body.amount, paymentMethod: body.paymentMethod ?? null, notes: body.notes ?? null, status: 'POSTED', paidAt: body.paidAt ?? entry.createdAt, allocations })
    }
  }
  return { customers: state.snapshot?.customers ?? [], debts, payments }
}

export function ledgerBalances(debts: DebtTransaction[], customerId?: string) {
  let money = 0n, goods = 0n
  for (const debt of debts) {
    if (debt.status !== 'ACTIVE' || (customerId && debt.customerId !== customerId)) continue
    const amount = toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n
    if (debt.type === 'MONEY_LOAN') money += amount
    else goods += amount
  }
  return { moneyLoan: formatMinorUnits(money), storeItems: formatMinorUnits(goods), combined: formatMinorUnits(money + goods) }
}

export function validatePayment(state: OfflineState, customerId: string, body: PaymentInput) {
  const { debts } = projectLedger(state)
  const amount = toMinorUnits(body.amount)
  const seen = new Set<string>()
  let allocated = 0n
  for (const allocation of body.allocations) {
    const id = state.mappings[allocation.transactionId] ?? allocation.transactionId
    const debt = debts.find((debt) => debt.id === allocation.transactionId || debt.id === id)
    const cents = toMinorUnits(allocation.allocatedAmount)
    if (!debt || debt.customerId !== customerId || debt.status !== 'ACTIVE' || seen.has(id) || cents === null || cents <= 0n || cents > (toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n)) throw new Error('Payment exceeds the available saved balance. Review its allocations.')
    seen.add(id); allocated += cents
  }
  if (!amount || amount <= 0n || allocated !== amount) throw new Error('Payment allocations must match the payment amount.')
}
