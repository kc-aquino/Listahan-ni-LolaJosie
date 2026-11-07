export function toMinorUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(value)) {
    return null
  }
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function formatMinorUnits(value: bigint) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const dollars = absolute / 100n
  const cents = (absolute % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${dollars}.${cents}`
}

export function outstandingAmount(
  totalAmount: string,
  allocations: { allocatedAmount: string }[],
) {
  const total = toMinorUnits(totalAmount)
  if (total === null) return '0.00'
  const paid = allocations.reduce(
    (sum, allocation) => sum + (toMinorUnits(allocation.allocatedAmount) ?? 0n),
    0n,
  )
  return formatMinorUnits(total - paid)
}

/** A valid debt is completed when posted payments cover its full balance. */
export function isDebtCompleted(debt: {
  status: string
  totalAmount: string
  allocations?: { allocatedAmount: string }[]
}) {
  return debt.status === 'ACTIVE' && toMinorUnits(debt.totalAmount) !== null &&
    toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) === 0n
}
