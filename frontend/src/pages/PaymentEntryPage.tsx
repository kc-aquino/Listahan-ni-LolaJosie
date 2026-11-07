import { ItemDetails } from '../components/molecules/ItemDetails'
import { allocateAcrossDebts } from '../lib/paymentAllocation'
import { DecimalInput } from '../components/atoms/DecimalInput'
import { Icon } from '../components/atoms/Icon'
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import { ConfirmationDialog } from '../components/organisms/ConfirmationDialog'
import { createPayment, getCustomerTransactions, getCustomers } from '../lib/api'
import type { DebtTransaction } from '../lib/api'
import { idempotencyKeyFor } from '../lib/idempotency'
import type { IdempotencyAttempt } from '../lib/idempotency'
import { formatMinorUnits, outstandingAmount, toMinorUnits } from '../lib/money'

type AllocationDraft = { transactionId: string; allocatedAmount: string }

export function PaymentEntryPage() {
  const { translate } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [allocationMode, setAllocationMode] = useState<'selected' | 'all'>('selected')
  const [manualAllocations, setAllocations] = useState<AllocationDraft[]>([
    { transactionId: '', allocatedAmount: '' },
  ])
  const attempt = useRef<IdempotencyAttempt['current']>(null)
  const customers = useQuery({
    queryKey: ['customers', '', true],
    queryFn: () => getCustomers('', true),
  })
  const debts = useQuery({
    queryKey: ['customer-transactions', customerId],
    queryFn: () => getCustomerTransactions(customerId),
    enabled: Boolean(customerId),
  })
  const activeDebts =
    debts.data?.data.filter(
      (debt) =>
        debt.status === 'ACTIVE' &&
        (toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n) > 0n,
    ) ?? []
  const paymentCents = toMinorUnits(amount)
  const totalOutstanding = activeDebts.reduce((sum, debt) => sum + (toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n), 0n)
  const automaticAllocations = allocateAcrossDebts(activeDebts, amount)
  const allocations = allocationMode === 'all' ? automaticAllocations : manualAllocations
  const allocatedCents = allocations.reduce(
    (sum, allocation) => sum + (toMinorUnits(allocation.allocatedAmount) ?? 0n),
    0n,
  )
  const exactAllocation =
    paymentCents !== null &&
    paymentCents > 0n &&
    allocations.length > 0 &&
    allocations.every(
      (allocation) =>
        activeDebts.some((debt) => debt.id === allocation.transactionId &&
          (toMinorUnits(allocation.allocatedAmount) ?? 0n) <= (toMinorUnits(outstandingAmount(debt.totalAmount, debt.allocations ?? [])) ?? 0n)) &&
        toMinorUnits(allocation.allocatedAmount) !== null &&
        (toMinorUnits(allocation.allocatedAmount) ?? 0n) > 0n,
    ) &&
    allocatedCents === paymentCents

  const receivePayment = useMutation({
    mutationFn: async () => {
      const request = {
        amount,
        ...(paymentMethod.trim() ? { paymentMethod: paymentMethod.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        allocations: allocations.map((allocation) => ({
          transactionId: allocation.transactionId,
          allocatedAmount: allocation.allocatedAmount,
        })),
      }
      return createPayment(customerId, request, idempotencyKeyFor(attempt, request))
    },
    onSuccess: async () => {
      setConfirmationOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-balances', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-transactions', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-payments', customerId] }),
      ])
      navigate(`/customers/${customerId}`)
    },
    onError: () => setConfirmationOpen(false),
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
  if (customers.data.data.length === 0) {
    return (
      <FeedbackState
        actionLabel={translate('addCustomer')}
        description={translate('emptyCustomersDescription')}
        onAction={() => navigate('/customers')}
        title={translate('emptyCustomers')}
        type="empty"
      />
    )
  }

  const remainingCents = paymentCents === null ? null : paymentCents - allocatedCents
  const selectedCustomerName =
    customers.data.data.find((customer) => customer.id === customerId)?.name ?? ''
  const allocationSummary = <ul className="grid gap-4">{allocations.map((allocation) => {
    const debt = activeDebts.find((entry) => entry.id === allocation.transactionId)
    if (!debt) return null
    return <li key={debt.id} className="rounded-box border border-base-300 p-3">
      <p className="font-semibold">{translate(debt.type === 'MONEY_LOAN' ? 'moneyDebt' : 'goodsDebt')}</p>
      {debt.items.length > 0 && <div className="mt-3"><ItemDetails items={debt.items} /></div>}
      {debt.description && <p className="mt-2">{debt.description}</p>}
      <dl className="mt-3"><dt className="text-sm text-base-content/65">{translate('allocationAmount')}</dt><dd className="mt-1 font-bold">₱ {allocation.allocatedAmount}</dd></dl>
    </li>
  })}</ul>

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-5">
      <Link className="link link-primary w-fit text-base font-semibold" to="/customers">
        ← {translate('backToCustomers')}
      </Link>
      <header>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('paymentsEyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{translate('pageTitleReceivePayment')}</h1>
      </header>

      <form
        className="card border-2 border-base-300 bg-base-100 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          if (exactAllocation) setConfirmationOpen(true)
        }}
      >
        <div className="card-body gap-5 p-5 sm:p-8">
          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="customers" />{translate('chooseCustomer')}</span>
            <select
              className="select select-bordered w-full text-lg"
              onChange={(event) => {
                setCustomerId(event.target.value)
                setAmount('')
                setAllocationMode('selected')
                setAllocations([{ transactionId: '', allocatedAmount: '' }])
              }}
              required
              value={customerId}
            >
              <option disabled value="">{translate('chooseCustomer')}</option>
              {customers.data.data.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.archivedAt ? ` · ${translate('archived')}` : ''}
                </option>
              ))}
            </select>
          </label>

          {customerId && (debts.isPending ? (
            <FeedbackState type="loading" title={translate('loadingDebts')} />
          ) : debts.isError ? (
            <FeedbackState
              description={debts.error.message}
              title={translate('couldNotLoadDebts')}
              type="error"
            />
          ) : activeDebts.length === 0 ? (
            <FeedbackState
              description={translate('noActiveDebtsDescription')}
              title={translate('noActiveDebts')}
              type="empty"
            />
          ) : null)}

          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="money" />{translate('paymentAmount')}</span>
            <DecimalInput
              className="input input-bordered w-full text-2xl font-bold"
              inputMode="decimal"
              min="0.01"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
              step="0.01"
              value={amount}
            />
          </label>

          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5" name="reports" />{translate('paymentGoesTo')}</span>
            <select className="select select-bordered w-full" value={allocationMode} onChange={(event) => {
              const mode = event.target.value as 'selected' | 'all'
              setAllocationMode(mode)
              if (mode === 'all' && !amount) setAmount(formatMinorUnits(totalOutstanding))
            }}>
              <option value="selected">{translate('selectedDebts')}</option>
              <option value="all">{translate('allDebts')}</option>
            </select>
            {allocationMode === 'all' && <p className="text-sm text-base-content/70">{translate('allDebtsHelp')}</p>}
          </label>
          <fieldset className="grid gap-4">
            <legend className="mb-3 font-semibold"><span className="form-section-label"><Icon className="size-5 shrink-0" name="reports" />{translate('allocatePayment')}</span></legend>
            {allocations.map((allocation, index) => (
              <div className="grid gap-3 rounded-box border border-base-300 p-4 sm:grid-cols-2" key={index}>
                <label className="form-control gap-2">
                  <span className="font-semibold">{translate('debtEntry')}</span>
                  <select
                    className="select select-bordered w-full"
                    disabled={allocationMode === 'all'}
                    onChange={(event) =>
                      setAllocations((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { transactionId: event.target.value, allocatedAmount: (() => {
                                const debt = activeDebts.find((debt) => debt.id === event.target.value)
                                return debt ? outstandingAmount(debt.totalAmount, debt.allocations ?? []) : ''
                              })() }
                            : entry,
                        ),
                      )
                    }
                    required
                    value={allocation.transactionId}
                  >
                    <option disabled value="">{translate('chooseDebt')}</option>
                    {activeDebts
                      .filter(
                        (debt) =>
                          debt.id === allocation.transactionId ||
                          !allocations.some(
                            (entry, itemIndex) =>
                              itemIndex !== index && entry.transactionId === debt.id,
                          ),
                      )
                      .map((debt) => (
                        <option key={debt.id} value={debt.id}>
                          {debtLabel(debt, translate)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="form-control gap-2">
                  <span className="font-semibold">{translate('allocationAmount')}</span>
                  <DecimalInput
                    className="input input-bordered w-full"
                    readOnly={allocationMode === 'all'}
                    inputMode="decimal"
                    min="0.01"
                    onChange={(event) =>
                      setAllocations((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, allocatedAmount: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="0.00"
                    required
                    step="0.01"
                          value={allocation.allocatedAmount}
                  />
                </label>
                {(() => {
                  const debt = activeDebts.find((entry) => entry.id === allocation.transactionId)
                  return debt ? <div className="grid gap-3 sm:col-span-2">
                    {debt.items.length > 0 && <ItemDetails items={debt.items} />}
                    {debt.description && <div><p className="text-sm text-base-content/65">{translate('notes')}</p><p>{debt.description}</p></div>}
                  </div> : null
                })()}
                {allocationMode === 'selected' && allocations.length > 1 && (
                  <button
                    className="btn btn-remove sm:col-span-2"
                    onClick={() =>
                      setAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    type="button"
                  >
                    <Icon className="size-5 shrink-0" name="trash" />{translate('removeAllocation')}
                  </button>
                )}
              </div>
            ))}
            {allocationMode === 'selected' && allocations.length < activeDebts.length && (
              <button
                className="btn btn-outline min-h-12"
                onClick={() =>
                  setAllocations((current) => [...current, { transactionId: '', allocatedAmount: '' }])
                }
                type="button"
              >
                ＋ {translate('addAllocation')}
              </button>
            )}
          </fieldset>

          {paymentCents !== null && paymentCents > 0n && (
            <p
              aria-live="polite"
              className={`rounded-box p-4 text-lg font-bold ${remainingCents === 0n ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}
            >
              {translate('unallocatedAmount')}: ₱ {formatMinorUnits(remainingCents ?? 0n)}
            </p>
          )}

          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="money" />{translate('paymentMethodOptional')}</span>
            <input
              className="input input-bordered w-full"
              maxLength={40}
              onChange={(event) => setPaymentMethod(event.target.value)}
              value={paymentMethod}
            />
          </label>
          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="notes" />{translate('notes')}</span>
            <textarea
              className="textarea textarea-bordered w-full"
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
          {receivePayment.error && (
            <p className="alert alert-error" role="alert">{receivePayment.error.message}</p>
          )}
          <button
            aria-busy={receivePayment.isPending}
            className="btn btn-accent min-h-14 text-lg"
            disabled={
              receivePayment.isPending ||
              !customerId ||
              !exactAllocation ||
              activeDebts.length === 0
            }
            type="submit"
          >
            {translate('reviewPayment')}
          </button>
        </div>
      </form>
      <ConfirmationDialog
        icon="money"
        cancelLabel={translate('cancel')}
        confirmLabel={translate('savePayment')}
        description={translate('confirmPaymentDescription')}
        details={[
          { label: translate('chooseCustomer'), value: selectedCustomerName, icon: 'customers' },
          { label: translate('paymentAmount'), value: `₱ ${amount || '0.00'}`, icon: 'money' },
          { label: translate('allocatePayment'), value: allocationSummary, icon: 'reports' },
        ]}
        isConfirming={receivePayment.isPending}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={() => receivePayment.mutate()}
        open={confirmationOpen}
        pendingLabel={translate('saving')}
        title={translate('confirmPaymentTitle')}
      />
    </section>
  )
}

function debtLabel(debt: DebtTransaction, translate: (key: 'moneyDebt' | 'goodsDebt') => string) {
  const label = debt.type === 'MONEY_LOAN' ? translate('moneyDebt') : translate('goodsDebt')
  return `${(debt.syncStatus === 'PENDING' || debt.id.startsWith('local:')) ? '⏳ ' : ''}${label} — ₱ ${outstandingAmount(debt.totalAmount, debt.allocations ?? [])}`
}
