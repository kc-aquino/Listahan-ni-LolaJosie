import { ItemDetails } from '../components/molecules/ItemDetails'
import { ItemNameInput } from '../components/atoms/ItemNameInput'
import { DecimalInput } from '../components/atoms/DecimalInput'
import { Icon } from '../components/atoms/Icon'
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import { ConfirmationDialog } from '../components/organisms/ConfirmationDialog'
import { createTransaction, getCustomers, getItemCatalog } from '../lib/api'
import { idempotencyKeyFor } from '../lib/idempotency'
import type { IdempotencyAttempt } from '../lib/idempotency'
import { formatMinorUnits, toMinorUnits } from '../lib/money'

type DebtType = 'MONEY_LOAN' | 'STORE_ITEMS'
type EntryMode = 'TOTAL_ONLY' | 'ITEMIZED'
type ItemDraft = { itemName: string; quantity: string; unitPrice: string }

function itemizedTotal(items: ItemDraft[]) {
  let total = 0n
  for (const item of items) {
    if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(item.quantity)) return null
    const [wholeQuantity, fractionalQuantity = ''] = item.quantity.split('.')
    const quantityMillis =
      BigInt(wholeQuantity) * 1000n + BigInt(fractionalQuantity.padEnd(3, '0'))
    if (quantityMillis === 0n) return null
    const unitPriceCents = toMinorUnits(item.unitPrice)
    if (unitPriceCents === null) return null
    const rawCents = quantityMillis * unitPriceCents
    total += (rawCents + 500n) / 1000n
  }
  return formatMinorUnits(total)
}

export function DebtEntryPage() {
  const { translate } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '')
  const [type, setType] = useState<DebtType>('MONEY_LOAN')
  const [entryMode, setEntryMode] = useState<EntryMode>('TOTAL_ONLY')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [items, setItems] = useState<ItemDraft[]>([
    { itemName: '', quantity: '1', unitPrice: '' },
  ])
  const attempt = useRef<IdempotencyAttempt['current']>(null)
  const customers = useQuery({
    queryKey: ['customers', ''],
    queryFn: () => getCustomers(),
  })
  const catalog = useQuery({
    queryKey: ['item-catalog'],
    queryFn: getItemCatalog,
    enabled: type === 'STORE_ITEMS' && entryMode === 'ITEMIZED',
  })
  const addDebt = useMutation({
    mutationFn: async () => {
      const request =
        type === 'MONEY_LOAN'
          ? {
              type,
              totalAmount: amount,
              ...(description.trim() ? { description: description.trim() } : {}),
            }
          : entryMode === 'TOTAL_ONLY'
            ? {
                type,
                entryMode,
                totalAmount: amount,
                ...(description.trim() ? { description: description.trim() } : {}),
              }
            : {
                type,
                entryMode,
                items: items.map((item) => ({
                  itemName: item.itemName.trim(),
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
                ...(description.trim() ? { description: description.trim() } : {}),
              }
      const key = idempotencyKeyFor(attempt, request)
      return createTransaction(customerId, request, key)
    },
    onSuccess: async () => {
      setConfirmationOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['item-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-balances', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-transactions', customerId] }),
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

  const calculatedTotal =
    type === 'MONEY_LOAN' || entryMode === 'TOTAL_ONLY' ? amount : itemizedTotal(items)
  const totalCents = toMinorUnits(calculatedTotal ?? '')
  const selectedCustomerName =
    customers.data.data.find((customer) => customer.id === customerId)?.name ?? ''
  const categoryLabel = type === 'MONEY_LOAN'
    ? translate('moneyDebt')
    : translate('goodsDebt')

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-5">
      <Link className="link link-primary w-fit text-base font-semibold" to="/customers">
        ← {translate('backToCustomers')}
      </Link>
      <header>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('twoSeparateLedgers')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{translate('pageTitleAddDebt')}</h1>
      </header>

      <form
        className="card border-2 border-base-300 bg-base-100 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          if (totalCents !== null && totalCents > 0n) setConfirmationOpen(true)
        }}
      >
        <div className="card-body gap-5 p-5 sm:p-8">
          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="customers" />{translate('chooseCustomer')}</span>
            <select
              className="select select-bordered w-full text-lg"
              onChange={(event) => setCustomerId(event.target.value)}
              required
              value={customerId}
            >
              <option disabled value="">{translate('chooseCustomer')}</option>
              {customers.data.data.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-3">
            <legend className="mb-2 font-semibold">{translate('debtCategory')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`card cursor-pointer border-2 p-4 ${type === 'MONEY_LOAN' ? 'border-primary bg-primary/10' : 'border-base-300'}`}>
                <span className="flex items-start gap-3">
                  <input
                    checked={type === 'MONEY_LOAN'}
                    className="radio radio-primary mt-1"
                    name="debt-type"
                    onChange={() => setType('MONEY_LOAN')}
                    type="radio"
                  />
                  <span>
                    <span className="block font-bold">{translate('moneyDebt')}</span>
                    <span className="mt-1 block text-sm text-base-content/70">{translate('moneyDescription')}</span>
                  </span>
                </span>
              </label>
              <label className={`card cursor-pointer border-2 p-4 ${type === 'STORE_ITEMS' ? 'border-primary bg-primary/10' : 'border-base-300'}`}>
                <span className="flex items-start gap-3">
                  <input
                    checked={type === 'STORE_ITEMS'}
                    className="radio radio-primary mt-1"
                    name="debt-type"
                    onChange={() => setType('STORE_ITEMS')}
                    type="radio"
                  />
                  <span>
                    <span className="block font-bold">{translate('goodsDebt')}</span>
                    <span className="mt-1 block text-sm text-base-content/70">{translate('goodsDescription')}</span>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {type === 'STORE_ITEMS' && (
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('howToRecord')}</span>
              <select
                className="select select-bordered w-full text-lg"
                onChange={(event) => setEntryMode(event.target.value as EntryMode)}
                value={entryMode}
              >
                <option value="TOTAL_ONLY">{translate('totalOnly')}</option>
                <option value="ITEMIZED">{translate('itemized')}</option>
              </select>
            </label>
          )}

          {type === 'STORE_ITEMS' && entryMode === 'ITEMIZED' ? (
            <fieldset className="grid gap-4">
              <legend className="mb-3 font-semibold"><span className="form-section-label"><Icon className="size-5 shrink-0" name="store" />{translate('itemsTaken')}</span></legend>
              {catalog.isError && <p role="alert" className="text-error">{catalog.error.message}</p>}
              {items.map((item, index) => (
                <div className="grid gap-3 rounded-box border border-base-300 p-4 sm:grid-cols-3" key={index}>
                  <div className="form-control gap-2 sm:col-span-3">
                    <span className="font-semibold">{translate('itemName')}</span>
                    <ItemNameInput label={translate('itemName')} value={item.itemName} items={catalog.data ?? []}
                      onChange={(name, price) => setItems((current) => current.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, itemName: name, unitPrice: price ?? catalog.data?.find((saved) => saved.itemName.toLowerCase() === name.trim().toLowerCase())?.unitPrice ?? entry.unitPrice } : entry))} />
                  </div>
                  <label className="form-control gap-2">
                    <span className="font-semibold">{translate('quantity')}</span>
                    <DecimalInput
                      className="input input-bordered w-full"
                      inputMode="decimal"
                      min="0.001"
                      decimals={3}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, itemIndex) =>
                            itemIndex === index ? { ...entry, quantity: event.target.value } : entry,
                          ),
                        )
                      }
                      required
                      step="0.001"
                      value={item.quantity}
                    />
                  </label>
                  <label className="form-control gap-2 sm:col-span-2">
                    <span className="font-semibold">{translate('unitPrice')}</span>
                    <DecimalInput
                      className="input input-bordered w-full"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, itemIndex) =>
                            itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry,
                          ),
                        )
                      }
                      required
                      step="0.01"
                      value={item.unitPrice}
                    />
                  </label>
                  {items.length > 1 && (
                    <button
                      className="btn btn-remove sm:col-span-3"
                      onClick={() =>
                        setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                      type="button"
                    >
                      <Icon className="size-5 shrink-0" name="trash" />{translate('removeItem')}
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn btn-outline min-h-12"
                onClick={() =>
                  setItems((current) => [...current, { itemName: '', quantity: '1', unitPrice: '' }])
                }
                type="button"
              >
                ＋ {translate('addAnotherItem')}
              </button>
            </fieldset>
          ) : (
            <label className="form-control gap-2">
              <span className="form-section-label"><Icon className="size-5 shrink-0" name="money" />{translate('amountPeso')}</span>
              <DecimalInput
                autoComplete="off"
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
          )}

          <label className="form-control gap-2">
            <span className="form-section-label"><Icon className="size-5 shrink-0" name="notes" />{translate('descriptionOptional')}</span>
            <textarea
              className="textarea textarea-bordered w-full"
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>

          <p className="rounded-box bg-primary/10 p-4 text-lg font-bold">
            {translate('debtTotal')}: ₱ {calculatedTotal || '0.00'}
          </p>
          {addDebt.error && (
            <p className="alert alert-error" role="alert">{addDebt.error.message}</p>
          )}
          <button
            aria-busy={addDebt.isPending}
            className="btn btn-primary min-h-14 text-lg"
            disabled={
              addDebt.isPending ||
              !customerId ||
              totalCents === null ||
              totalCents <= 0n ||
              (type === 'STORE_ITEMS' &&
                entryMode === 'ITEMIZED' &&
                items.some((item) => !item.itemName.trim()))
            }
            type="submit"
          >
            {translate('reviewDebt')}
          </button>
        </div>
      </form>
      <ConfirmationDialog
        icon="store"
        cancelLabel={translate('cancel')}
        confirmLabel={translate('saveDebt')}
        description={translate('confirmDebtDescription')}
        details={[
          { label: translate('chooseCustomer'), value: selectedCustomerName, icon: 'customers' },
          { label: translate('debtCategory'), value: categoryLabel, icon: type === 'MONEY_LOAN' ? 'money' : 'store' },
          ...(type === 'STORE_ITEMS' && entryMode === 'ITEMIZED' ? [{ label: translate('itemsTaken'), value: <ItemDetails items={items} />, icon: 'store' as const }] : []),
          { label: translate('debtTotal'), value: `₱ ${calculatedTotal || '0.00'}`, icon: 'money' },
        ]}
        isConfirming={addDebt.isPending}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={() => addDebt.mutate()}
        open={confirmationOpen}
        pendingLabel={translate('saving')}
        title={translate('confirmDebtTitle')}
      />
    </section>
  )
}
