import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import { ConfirmationDialog } from '../components/organisms/ConfirmationDialog'
import {
  archiveCustomer,
  getCustomer,
  getCustomerBalances,
  getCustomerTransactions,
  restoreCustomer,
} from '../lib/api'
import { outstandingAmount } from '../lib/money'

function peso(amount: string) {
  return `₱ ${amount}`
}

export function CustomerProfilePage() {
  const { customerId = '' } = useParams()
  const { language, translate } = useLanguage()
  const queryClient = useQueryClient()
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false)
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId),
    enabled: Boolean(customerId),
  })
  const balances = useQuery({
    queryKey: ['customer-balances', customerId],
    queryFn: () => getCustomerBalances(customerId),
    enabled: Boolean(customerId),
  })
  const history = useQuery({
    queryKey: ['customer-transactions', customerId],
    queryFn: () => getCustomerTransactions(customerId),
    enabled: Boolean(customerId),
  })
  const changeArchiveStatus = useMutation({
    mutationFn: () =>
      customer.data?.archivedAt
        ? restoreCustomer(customerId)
        : archiveCustomer(customerId),
    onSuccess: async () => {
      setArchiveConfirmationOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['report-customers'] }),
      ])
    },
    onError: () => setArchiveConfirmationOpen(false),
  })

  if (customer.isPending) {
    return <FeedbackState type="loading" title={translate('loadingCustomer')} />
  }
  if (customer.isError) {
    return (
      <FeedbackState
        description={customer.error.message}
        title={translate('couldNotLoadCustomer')}
        type="error"
      />
    )
  }

  return (
    <section className="grid gap-5">
      <Link className="link link-primary w-fit text-base font-semibold" to="/customers">
        ← {translate('backToCustomers')}
      </Link>
      <header className="card border-2 border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-3 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary/15 text-3xl font-bold text-secondary"
            >
              {customer.data.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-3xl font-bold">{customer.data.name}</h1>
              {customer.data.archivedAt && (
                <span className="badge badge-warning mt-2">{translate('archived')}</span>
              )}
              <p className="mt-1 text-base-content/75">
                {customer.data.contactNumber || translate('noContactNumber')}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!customer.data.archivedAt && (
                <Link className="btn btn-secondary min-h-12" to={`/debts/new?customerId=${customerId}`}>
                  {translate('addDebt')}
                </Link>
              )}
              <Link className="btn btn-accent min-h-12" to={`/payments/new?customerId=${customerId}`}>
                {translate('receivePayment')}
              </Link>
              <Link className="btn btn-outline min-h-12" to={`/history?customerId=${customerId}`}>
                {translate('pageTitleHistory')}
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              className={`btn min-h-12 ${customer.data.archivedAt ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setArchiveConfirmationOpen(true)}
              type="button"
            >
              {customer.data.archivedAt
                ? translate('restoreCustomer')
                : translate('archiveCustomer')}
            </button>
          </div>
          {changeArchiveStatus.error && (
            <p className="alert alert-error" role="alert">
              {changeArchiveStatus.error.message}
            </p>
          )}
          {customer.data.notes && (
            <p className="mt-2 rounded-box bg-base-200 p-4 text-base leading-relaxed">
              {customer.data.notes}
            </p>
          )}
        </div>
      </header>

      {balances.isPending ? (
        <FeedbackState type="loading" title={translate('loadingBalances')} />
      ) : balances.isError ? (
        <FeedbackState
          description={balances.error.message}
          title={translate('couldNotLoadBalances')}
          type="error"
        />
      ) : (
        <section aria-label={translate('balances')} className="grid gap-3 sm:grid-cols-3">
          <BalanceCard label={translate('moneyDebt')} value={balances.data.moneyLoan} />
          <BalanceCard label={translate('goodsDebt')} value={balances.data.storeItems} />
          <BalanceCard
            label={translate('combinedBalance')}
            value={balances.data.combined}
            emphasis
          />
        </section>
      )}

      <section aria-labelledby="customer-history-title" className="grid gap-3">
        <h2 className="text-2xl font-bold" id="customer-history-title">
          {translate('debtHistory')}
        </h2>
        {history.isPending ? (
          <FeedbackState type="loading" title={translate('loadingHistory')} />
        ) : history.isError ? (
          <FeedbackState
            description={history.error.message}
            title={translate('couldNotLoadHistory')}
            type="error"
          />
        ) : history.data.data.length === 0 ? (
          <FeedbackState
            description={translate('emptyDebtHistoryDescription')}
            title={translate('emptyDebtHistory')}
            type="empty"
          />
        ) : (
          <ul className="grid gap-3">
            {history.data.data.map((entry) => (
              <li
                className="card border-2 border-base-300 bg-base-100 shadow-sm"
                key={entry.id}
              >
                <div className="card-body gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {entry.type === 'MONEY_LOAN'
                        ? translate('moneyDebt')
                        : translate('goodsDebt')}
                    </p>
                    <p className="mt-1 text-base-content/70">
                      {new Date(entry.occurredAt).toLocaleDateString(
                        language === 'tl' ? 'fil-PH' : 'en-PH',
                      )}
                      {entry.description ? ` · ${entry.description}` : ''}
                    </p>
                    {entry.items.length > 0 && (
                      <p className="mt-1 text-sm text-base-content/70">
                        {entry.items.map((item) => item.itemName).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <span className="text-xl font-extrabold text-primary">
                      {peso(
                        entry.status === 'ACTIVE'
                          ? outstandingAmount(entry.totalAmount, entry.allocations ?? [])
                          : '0.00',
                      )}
                    </span>
                    <span className="badge badge-outline">
                      {entry.status === 'ACTIVE' ? translate('remaining') : entry.status}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmationDialog
        cancelLabel={translate('cancel')}
        confirmLabel={translate(customer.data.archivedAt ? 'restoreCustomer' : 'archiveCustomer')}
        description={translate(
          customer.data.archivedAt
            ? 'confirmRestoreCustomerDescription'
            : 'confirmArchiveCustomerDescription',
        )}
        isConfirming={changeArchiveStatus.isPending}
        onCancel={() => setArchiveConfirmationOpen(false)}
        onConfirm={() => changeArchiveStatus.mutate()}
        open={archiveConfirmationOpen}
        pendingLabel={translate('saving')}
        title={translate(
          customer.data.archivedAt ? 'confirmRestoreCustomer' : 'confirmArchiveCustomer',
        )}
      />
    </section>
  )
}

function BalanceCard({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <article
      className={`card border-2 ${emphasis ? 'border-primary/50 bg-primary/10' : 'border-base-300 bg-base-100'} shadow-sm`}
    >
      <div className="card-body gap-2 p-5">
        <h2 className="font-semibold text-base-content/75">{label}</h2>
        <p className="break-all text-2xl font-extrabold text-primary">₱ {value}</p>
      </div>
    </article>
  )
}
