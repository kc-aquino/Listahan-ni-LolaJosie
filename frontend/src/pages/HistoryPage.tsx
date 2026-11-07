import { DateInput } from '../components/atoms/DateInput'
import { formatDate } from '../lib/date'
import type { ReactNode } from 'react'
import { ItemDetails } from '../components/molecules/ItemDetails'
import { Icon } from '../components/atoms/Icon'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import { ConfirmationDialog } from '../components/organisms/ConfirmationDialog'
import {
  getCustomerPayments,
  getCustomerTransactions,
  getCustomers,
  reversePayment,
  reverseTransaction,
  voidPayment,
  voidTransaction,
} from '../lib/api'
import { isDebtCompleted, outstandingAmount, toMinorUnits } from '../lib/money'

type TimelineEntry = {
  id: string
  date: string
  amount: string
  status: string
  title: string
  detail: ReactNode
  isPayment: boolean
  canCorrect: boolean
  hasPostedAllocations: boolean
}

export function HistoryPage() {
  const { translate } = useLanguage()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '')
  const [showDates, setShowDates] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [correction, setCorrection] = useState<{
    id: string
    isPayment: boolean
    action: 'void' | 'reverse'
    title: string
  } | null>(null)
  const customers = useQuery({
    queryKey: ['customers', '', true],
    queryFn: () => getCustomers('', true),
  })
  const history = useQuery({
    queryKey: ['history', customerId, customers.data?.data.map((customer) => customer.id)],
    enabled: Boolean(customers.data),
    queryFn: async () => {
      const selected = customers.data!.data.filter((customer) => !customerId || customer.id === customerId)
      const records = await Promise.all(selected.map(async (customer) => {
        const [transactions, payments] = await Promise.all([
          getCustomerTransactions(customer.id), getCustomerPayments(customer.id),
        ])
        return {
          transactions: transactions.data.map((entry) => ({ ...entry, customerName: customer.name })),
          payments: payments.data.map((entry) => ({ ...entry, customerName: customer.name })),
        }
      }))
      return { transactions: records.flatMap((record) => record.transactions), payments: records.flatMap((record) => record.payments) }
    },
  })
  const changeStatus = useMutation({
    mutationFn: async () => {
      if (!correction) throw new Error('Choose a record to correct.')
      if (correction.isPayment) {
        return correction.action === 'void'
          ? voidPayment(correction.id)
          : reversePayment(correction.id)
      }
      return correction.action === 'void'
        ? voidTransaction(correction.id)
        : reverseTransaction(correction.id)
    },
    onSuccess: async () => {
      setCorrection(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-balances'] }),
        queryClient.invalidateQueries({ queryKey: ['item-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['report-customers'] }),
      ])
    },
    onError: () => setCorrection(null),
  })

  if (customers.isPending) {
    return <FeedbackState type="loading" title={translate('loadingCustomers')} />
  }
  if (customers.isError) {
    return (
      <FeedbackState
        description={customers.error.message}
        title={translate('couldNotLoadCustomers')}
        type="error"
      />
    )
  }

  const timeline: TimelineEntry[] = [
    ...(history.data?.transactions ?? []).map((entry) => ({
      id: entry.id,
      date: entry.occurredAt,
      amount:
        entry.status === 'ACTIVE'
          ? outstandingAmount(entry.totalAmount, entry.allocations ?? [])
          : '0.00',
      status: (entry.syncStatus === 'PENDING' || entry.id.startsWith('local:')) ? translate('offlinePendingLabel') : isDebtCompleted(entry) ? translate('completed') : entry.status,
      title:
        entry.type === 'MONEY_LOAN'
          ? translate('moneyDebt')
          : translate('goodsDebt'),
      detail: <div className="grid gap-3">
        {!customerId && <div><p className="text-sm text-base-content/65">{translate('customerName')}</p><p className="font-semibold">{entry.customerName}</p></div>}
        {entry.items.length > 0 && <ItemDetails items={entry.items} />}
        {entry.description && <div><p className="text-sm text-base-content/65">{translate('notes')}</p><p>{entry.description}</p></div>}
      </div>,
      isPayment: false,
      canCorrect:
        !entry.id.startsWith('local:') && entry.status === 'ACTIVE' &&
        !(entry.allocations ?? []).some(
          (allocation) => (toMinorUnits(allocation.allocatedAmount) ?? 0n) > 0n,
        ),
      hasPostedAllocations:
        !entry.id.startsWith('local:') && entry.syncStatus !== 'PENDING' && entry.status === 'ACTIVE' &&
        (entry.allocations ?? []).some(
          (allocation) => (toMinorUnits(allocation.allocatedAmount) ?? 0n) > 0n,
        ),
    })),
    ...(history.data?.payments ?? []).map((payment) => ({
      id: payment.id,
      date: payment.paidAt,
      amount: payment.amount,
      status: payment.id.startsWith('local:') ? translate('offlinePendingLabel') : payment.status,
      title: translate('paymentReceived'),
      detail: <div className="grid gap-3">
        {!customerId && <div><p className="text-sm text-base-content/65">{translate('customerName')}</p><p className="font-semibold">{payment.customerName}</p></div>}
        <div><p className="text-sm text-base-content/65">{translate('paymentMethodOptional')}</p><p>{payment.paymentMethod ?? translate('paymentMethodNotSpecified')}</p></div>
        <ul className="grid gap-2">{payment.allocations.map((allocation, index) => <li key={index} className="rounded-box border border-base-300 p-3">
          <p className="font-semibold">{translate(allocation.transaction?.type === 'MONEY_LOAN' ? 'moneyDebt' : 'goodsDebt')}</p>
          <p className="mt-1">₱ {allocation.allocatedAmount}</p>
        </li>)}</ul>
        {payment.notes && <div><p className="text-sm text-base-content/65">{translate('notes')}</p><p>{payment.notes}</p></div>}
      </div>,
      isPayment: true,
      canCorrect: !payment.id.startsWith('local:') && payment.status === 'POSTED',
      hasPostedAllocations: false,
    })),
  ].filter((entry) => {
    const date = new Date(entry.date)
    const localDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return !showDates || ((!from || localDay >= from) && (!to || localDay <= to))
  }).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())

  return (
    <section className="grid gap-5">
      <header>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('historyEyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{translate('pageTitleHistory')}</h1>
      </header>

      <div className="flex items-end gap-3">
      <label className="form-control flex-1 gap-2">
        <span className="font-semibold">{translate('chooseCustomer')}</span>
        <select
          className="select select-bordered w-full bg-base-100 text-lg sm:max-w-xl"
          onChange={(event) => setCustomerId(event.target.value)}
          value={customerId}
        >
          <option value="">{translate('allCustomers')}</option>
          {customers.data.data.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}{customer.archivedAt ? ` · ${translate('archived')}` : ''}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={`btn btn-outline shrink-0 ${showDates ? 'bg-primary/10' : ''}`} aria-label={translate('dateFilter')} title={translate('dateFilter')} aria-expanded={showDates} aria-controls="history-dates" onClick={() => setShowDates((visible) => !visible)}><Icon name="calendar" className="size-6" /></button>
      </div>

      {showDates && <div id="history-dates" className="grid gap-4 rounded-box border border-base-300 bg-base-100 p-4 sm:grid-cols-2">
        <label className="form-control gap-2">
          <span className="form-section-label"><Icon name="history" className="size-5" />{translate('from')}</span>
          <DateInput type="date" className="input input-bordered w-full" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="form-control gap-2">
          <span className="form-section-label"><Icon name="history" className="size-5" />{translate('to')}</span>
          <DateInput type="date" className="input input-bordered w-full" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>}
      {history.isPending ? (
        <FeedbackState type="loading" title={translate('loadingHistory')} />
      ) : history.isError ? (
        <FeedbackState description={history.error.message} title={translate('couldNotLoadHistory')} type="error" />
      ) : timeline.length === 0 ? (
        <FeedbackState
          description={translate('emptyDebtHistoryDescription')}
          title={translate('emptyHistory')}
          type="empty"
        />
      ) : (
        <ol className="grid gap-3">
          {timeline.map((entry) => (
            <li
              className={`card border-2 ${entry.isPayment ? 'border-accent/30 bg-accent/5' : 'border-base-300 bg-base-100'} shadow-sm`}
              key={`${entry.isPayment ? 'payment' : 'debt'}-${entry.id}`}
            >
              <div className="card-body gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`grid size-12 shrink-0 place-items-center rounded-full text-xl font-bold ${entry.isPayment ? 'bg-accent/15 text-accent' : 'bg-secondary/15 text-primary'}`}
                  >
                    {entry.isPayment ? '₱' : '−'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{entry.title}</h2>
                    <div className="mt-3 text-base-content/80">{entry.detail}</div>
                    <time className="mt-1 block text-sm text-base-content/65" dateTime={entry.date}>
                      {formatDate(entry.date)}
                    </time>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <span className="text-xl font-extrabold">
                    ₱ {entry.amount}
                  </span>
                  <span className="badge badge-outline">{entry.status}</span>
                </div>
              </div>
              {entry.canCorrect && (
                <div className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:justify-end">
                  <button
                    className="btn btn-outline btn-error min-h-12"
                    onClick={() =>
                      setCorrection({
                        id: entry.id,
                        isPayment: entry.isPayment,
                        action: 'void',
                        title: entry.title,
                      })
                    }
                    type="button"
                  >
                    {translate('voidEntry')}
                  </button>
                  <button
                    className="btn btn-outline btn-warning min-h-12"
                    onClick={() =>
                      setCorrection({
                        id: entry.id,
                        isPayment: entry.isPayment,
                        action: 'reverse',
                        title: entry.title,
                      })
                    }
                    type="button"
                  >
                    {translate('reverseEntry')}
                  </button>
                </div>
              )}
              {entry.hasPostedAllocations && (
                <p className="px-5 pb-4 text-sm font-semibold text-warning">
                  {translate('reversePaymentsFirst')}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {changeStatus.error && (
        <p className="alert alert-error" role="alert">{changeStatus.error.message}</p>
      )}
      {customerId && (
        <Link className="btn btn-outline min-h-12 w-fit" to={`/customers/${customerId}`}>
          {translate('viewCustomerProfile')}
        </Link>
      )}
      <ConfirmationDialog
        icon="history"
        cancelLabel={translate('cancel')}
        confirmLabel={translate(correction?.action === 'void' ? 'voidEntry' : 'reverseEntry')}
        description={`${translate('confirmCorrectionDescription')} ${correction?.title ?? ''}.`}
        isConfirming={changeStatus.isPending}
        onCancel={() => setCorrection(null)}
        onConfirm={() => changeStatus.mutate()}
        open={correction !== null}
        pendingLabel={translate('saving')}
        title={translate(correction?.action === 'void' ? 'confirmVoidTitle' : 'confirmReverseTitle')}
      />
    </section>
  )
}
