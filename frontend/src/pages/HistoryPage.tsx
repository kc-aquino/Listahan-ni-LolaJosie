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
import { outstandingAmount, toMinorUnits } from '../lib/money'

type TimelineEntry = {
  id: string
  date: string
  amount: string
  status: string
  title: string
  detail: string
  isPayment: boolean
  canCorrect: boolean
  hasPostedAllocations: boolean
}

export function HistoryPage() {
  const { language, translate } = useLanguage()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '')
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
  const transactions = useQuery({
    queryKey: ['customer-transactions', customerId],
    queryFn: () => getCustomerTransactions(customerId),
    enabled: Boolean(customerId),
  })
  const payments = useQuery({
    queryKey: ['customer-payments', customerId],
    queryFn: () => getCustomerPayments(customerId),
    enabled: Boolean(customerId),
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
        queryClient.invalidateQueries({ queryKey: ['customer-transactions', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-payments', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-balances', customerId] }),
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
    ...(transactions.data?.data ?? []).map((entry) => ({
      id: entry.id,
      date: entry.occurredAt,
      amount:
        entry.status === 'ACTIVE'
          ? outstandingAmount(entry.totalAmount, entry.allocations ?? [])
          : '0.00',
      status: entry.status,
      title:
        entry.type === 'MONEY_LOAN'
          ? translate('moneyDebt')
          : translate('goodsDebt'),
      detail: entry.description ?? translate('debtEntryAdded'),
      isPayment: false,
      canCorrect:
        entry.status === 'ACTIVE' &&
        !(entry.allocations ?? []).some(
          (allocation) => (toMinorUnits(allocation.allocatedAmount) ?? 0n) > 0n,
        ),
      hasPostedAllocations:
        entry.status === 'ACTIVE' &&
        (entry.allocations ?? []).some(
          (allocation) => (toMinorUnits(allocation.allocatedAmount) ?? 0n) > 0n,
        ),
    })),
    ...(payments.data?.data ?? []).map((payment) => ({
      id: payment.id,
      date: payment.paidAt,
      amount: payment.amount,
      status: payment.status,
      title: translate('paymentReceived'),
      detail: [
        payment.paymentMethod ?? translate('paymentMethodNotSpecified'),
        ...payment.allocations.map((allocation) => {
          const category = allocation.transaction?.type === 'MONEY_LOAN'
            ? translate('moneyDebt')
            : translate('goodsDebt')
          return `${category} ₱ ${allocation.allocatedAmount}`
        }),
      ].join(' · '),
      isPayment: true,
      canCorrect: payment.status === 'POSTED',
      hasPostedAllocations: false,
    })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())

  return (
    <section className="grid gap-5">
      <header>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('historyEyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{translate('pageTitleHistory')}</h1>
      </header>

      <label className="form-control gap-2">
        <span className="font-semibold">{translate('chooseCustomer')}</span>
        <select
          className="select select-bordered w-full bg-base-100 text-lg sm:max-w-xl"
          onChange={(event) => setCustomerId(event.target.value)}
          value={customerId}
        >
          <option value="">{translate('chooseCustomer')}</option>
          {customers.data.data.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}{customer.archivedAt ? ` · ${translate('archived')}` : ''}
            </option>
          ))}
        </select>
      </label>

      {!customerId ? (
        <FeedbackState
          description={translate('selectCustomerHistory')}
          title={translate('chooseCustomer')}
          type="empty"
        />
      ) : transactions.isPending || payments.isPending ? (
        <FeedbackState type="loading" title={translate('loadingHistory')} />
      ) : transactions.isError || payments.isError ? (
        <FeedbackState
          description={transactions.error?.message ?? payments.error?.message}
          title={translate('couldNotLoadHistory')}
          type="error"
        />
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
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`grid size-12 shrink-0 place-items-center rounded-full text-xl font-bold ${entry.isPayment ? 'bg-accent/15 text-accent' : 'bg-secondary/15 text-primary'}`}
                  >
                    {entry.isPayment ? '₱' : '−'}
                  </span>
                  <div>
                    <h2 className="text-lg font-bold">{entry.title}</h2>
                    <p className="mt-1 text-base-content/70">{entry.detail}</p>
                    <time className="mt-1 block text-sm text-base-content/65" dateTime={entry.date}>
                      {new Date(entry.date).toLocaleString(
                        language === 'tl' ? 'fil-PH' : 'en-PH',
                      )}
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
