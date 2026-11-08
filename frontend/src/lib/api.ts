import { localResponse, offlineIdentity, rememberResponse, saveLedgerEntry, syncOfflineLedger } from './offline'
import type { DebtInput, PaymentInput } from './offlineModel'
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
  syncStatus?: 'PENDING'
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
  syncStatus?: 'PENDING'
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

// The browser calls the public same-origin route; Vercel selects the API service.
const apiBaseUrl = '/api'

async function request<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
  const { authenticated = true, ...init } = options
  const identityAtStart = authenticated ? offlineIdentity() : null
  const isRead = !init.method || init.method === 'GET'
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  if (authenticated && isRead) {
    const local = await localResponse(path, offline)
    if (local !== undefined) return local as T
  }
  if (offline) throw new ApiError('This action needs a connection or a saved offline copy. Connect once to prepare this device.', 0)
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = authenticated ? (window.localStorage?.getItem('lista-ni-lola-token') ?? window.sessionStorage.getItem('lista-ni-lola-token')) : null
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try { response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers }) }
  catch (error) {
    if (authenticated && isRead) {
      const local = await localResponse(path, true)
      if (local !== undefined) return local as T
    }
    throw error
  }

  if (authenticated && identityAtStart && offlineIdentity()?.token !== identityAtStart.token) {
    throw new ApiError('The session changed while loading. Please load this page again.', 401)
  }
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

  const value = (await response.json()) as T
  if (authenticated && isRead) void rememberResponse(path, value).catch(() => {})
  if (authenticated && !isRead) void syncOfflineLedger().catch(() => {})
  return value
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

async function requestAll<T>(path: string): Promise<Paginated<T>> {
  const separator = path.includes('?') ? '&' : '?'
  const first = await request<Paginated<T>>(`${path}${separator}page=1&pageSize=100`)
  const data = [...first.data]
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await request<Paginated<T>>(`${path}${separator}page=${page}&pageSize=100`)
    data.push(...next.data)
  }
  return { data, pagination: { ...first.pagination, page: 1, pageSize: data.length, totalPages: 1 } }
}

export async function getItemCatalog() {
  const customers = await getCustomers('', true)
  const records = await Promise.all(customers.data.map((customer) => getCustomerTransactions(customer.id)))
  const latest = new Map<string, { itemName: string; unitPrice: string }>()
  records.flatMap((record) => record.data)
    .filter((debt) => debt.status === 'ACTIVE')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .forEach((debt) => debt.items.forEach((item) => latest.set(item.itemName.trim().toLowerCase(), {
      itemName: item.itemName, unitPrice: item.unitPrice,
    })))
  return [...latest.values()].sort((a, b) => a.itemName.localeCompare(b.itemName))
}

export function getCustomers(q = '', includeArchived = false) {
  const params = new URLSearchParams({
    includeArchived: String(includeArchived),
  })
  if (q.trim()) params.set('q', q.trim())
  return requestAll<Customer>(`/customers?${params}`)
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
  return saveLedgerEntry(customerId, 'debt', input as DebtInput, idempotencyKey) as Promise<DebtTransaction>
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
  return saveLedgerEntry(customerId, 'payment', input as PaymentInput, idempotencyKey)
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
  return requestAll<DebtTransaction>(
    `/customers/${customerId}/transactions`,
  )
}

export function getCustomerPayments(customerId: string) {
  return requestAll<CustomerPayment>(
    `/customers/${customerId}/payments`,
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
