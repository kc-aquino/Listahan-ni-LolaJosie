export type HealthResponse = {
  status: 'ok'
}

export type AuthUser = {
  id: string
  name: string
  username: string
  role: 'OWNER' | 'EMPLOYEE'
}

export type LoginResponse = {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  user: AuthUser
}

export type Customer = {
  id: string
  name: string
  contactNumber: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TransactionItem = {
  id: string
  itemName: string
  quantity: string
  unitPrice: string
  subtotal: string
}

export type DebtTransaction = {
  id: string
  customerId: string
  type: 'MONEY_LOAN' | 'STORE_ITEMS'
  entryMode: 'ITEMIZED' | 'TOTAL_ONLY' | null
  totalAmount: string
  status: 'ACTIVE' | 'VOIDED' | 'REVERSED'
  description: string | null
  occurredAt: string
  items: TransactionItem[]
  allocations?: { allocatedAmount: string }[]
}

export type CustomerBalances = {
  customerId: string
  moneyLoan: string
  storeItems: string
  combined: string
  asOf: string
}

export type CustomerPayment = {
  id: string
  amount: string
  paymentMethod: string | null
  notes: string | null
  status: 'POSTED' | 'VOIDED' | 'REVERSED'
  paidAt: string
  allocations: {
    transactionId: string
    allocatedAmount: string
    transaction?: { type: 'MONEY_LOAN' | 'STORE_ITEMS' }
  }[]
}

export type ReportTotals = {
  moneyLoan: string
  storeItems: string
  combined: string
}

export type ReportSummary = ReportTotals & {
  asOf: string
}

export type ReportCustomer = ReportTotals & {
  id: string
  name: string
  contactNumber: string | null
}

export type PeriodReportEntry = {
  period: string
  debtAdded: ReportTotals
  paymentsReceived: ReportTotals
  outstanding: ReportTotals
}

export type PeriodReport = {
  from: string
  to: string
  timeZone: string
  granularity: 'day' | 'month'
  data: PeriodReportEntry[]
}

export type Paginated<T> = {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
  const { authenticated = true, ...init } = options
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = authenticated ? window.sessionStorage.getItem('lista-ni-lola-token') : null
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api${path}`, { ...init, headers })

  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      window.dispatchEvent(new Event('lista-ni-lola:unauthorized'))
    }
    let message = `Request failed with status ${response.status}.`
    try {
      const body = (await response.json()) as { message?: string | string[] }
      if (typeof body.message === 'string') {
        message = body.message
      } else if (Array.isArray(body.message)) {
        message = body.message.join(' ')
      }
    } catch {
      // Keep the status-based message for responses without a JSON error body.
    }
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

export function getHealth() {
  return request<HealthResponse>('/health')
}

export function login(username: string, password: string) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    authenticated: false,
  })
}

export function getCustomers(q = '', includeArchived = false) {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '100',
    includeArchived: String(includeArchived),
  })
  if (q.trim()) params.set('q', q.trim())
  return request<Paginated<Customer>>(`/customers?${params}`)
}

export function createCustomer(input: {
  name: string
  contactNumber?: string
  notes?: string
}) {
  return request<Customer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createTransaction(
  customerId: string,
  input: Record<string, unknown>,
  idempotencyKey: string,
) {
  return request<DebtTransaction>(`/customers/${customerId}/transactions`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

export function voidTransaction(transactionId: string) {
  return request<DebtTransaction>(`/transactions/${transactionId}/void`, { method: 'POST' })
}

export function reverseTransaction(transactionId: string) {
  return request<DebtTransaction>(`/transactions/${transactionId}/reverse`, { method: 'POST' })
}

export function createPayment(
  customerId: string,
  input: {
    amount: string
    paymentMethod?: string
    notes?: string
    allocations: { transactionId: string; allocatedAmount: string }[]
  },
  idempotencyKey: string,
) {
  return request(`/customers/${customerId}/payments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

export function voidPayment(paymentId: string) {
  return request<CustomerPayment>(`/payments/${paymentId}/void`, { method: 'POST' })
}

export function reversePayment(paymentId: string) {
  return request<CustomerPayment>(`/payments/${paymentId}/reverse`, { method: 'POST' })
}

export function getCustomer(customerId: string) {
  return request<Customer>(`/customers/${customerId}`)
}

export function archiveCustomer(customerId: string) {
  return request<Customer>(`/customers/${customerId}/archive`, { method: 'POST' })
}

export function restoreCustomer(customerId: string) {
  return request<Customer>(`/customers/${customerId}/restore`, { method: 'POST' })
}

export function getCustomerBalances(customerId: string) {
  return request<CustomerBalances>(`/customers/${customerId}/balances`)
}

export function getCustomerTransactions(customerId: string) {
  return request<Paginated<DebtTransaction>>(
    `/customers/${customerId}/transactions?page=1&pageSize=100`,
  )
}

export function getCustomerPayments(customerId: string) {
  return request<Paginated<CustomerPayment>>(
    `/customers/${customerId}/payments?page=1&pageSize=100`,
  )
}

export function getReportSummary() {
  return request<ReportSummary>('/reports/summary')
}

export function getReportCustomers() {
  return request<Paginated<ReportCustomer> & { asOf: string }>(
    '/reports/customers?page=1&pageSize=100',
  )
}

export function getDailyReport(from: string, to: string) {
  const params = new URLSearchParams({ from, to, timeZone: 'Asia/Manila' })
  return request<PeriodReport>(`/reports/daily?${params}`)
}

export function getMonthlyReport(from: string, to: string) {
  const params = new URLSearchParams({ from, to, timeZone: 'Asia/Manila' })
  return request<PeriodReport>(`/reports/monthly?${params}`)
}
