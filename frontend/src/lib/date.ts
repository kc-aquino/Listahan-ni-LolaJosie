/** Display ledger dates consistently in the store's time zone. */
export function formatDate(value: string, monthOnly = false) {
  if (!value) return ''
  const dateOnly = /^\d{4}-\d{2}(-\d{2})?$/.test(value)
  const date = new Date(dateOnly ? `${value.length === 7 ? value + '-01' : value}T00:00:00+08:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', month: 'long', ...(monthOnly ? {} : { day: '2-digit' as const }), year: 'numeric',
  }).format(date)
}
