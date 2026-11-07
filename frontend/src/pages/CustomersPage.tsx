import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import { createCustomer, getCustomers } from '../lib/api'

export function CustomersPage() {
  const { translate } = useLanguage()
  const queryClient = useQueryClient()
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [notes, setNotes] = useState('')
  const customers = useQuery({
    queryKey: ['customers', search, includeArchived],
    queryFn: () => getCustomers(search, includeArchived),
  })
  const addCustomer = useMutation({
    mutationFn: () =>
      createCustomer({
        name,
        ...(contactNumber.trim() ? { contactNumber: contactNumber.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: async () => {
      setName('')
      setContactNumber('')
      setNotes('')
      setShowForm(false)
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  return (
    <section className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker text-xs font-bold tracking-[0.16em]">
            {translate('customersEyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{translate('pageTitleCustomers')}</h1>
        </div>
        <button
          className="btn btn-primary min-h-14 w-full text-base sm:w-auto"
          onClick={() => setShowForm((visible) => !visible)}
          type="button"
        >
          {showForm ? translate('cancel') : `＋ ${translate('addCustomer')}`}
        </button>
      </div>

      {showForm && (
        <form
          className="card border-2 border-base-300 bg-base-100 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            addCustomer.mutate()
          }}
        >
          <div className="card-body gap-4 p-5 sm:p-7">
            <h2 className="text-xl font-bold">{translate('createCustomer')}</h2>
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('customerName')}</span>
              <input
                autoComplete="name"
                className="input input-bordered w-full text-lg"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('contactNumber')}</span>
              <input
                autoComplete="tel"
                className="input input-bordered w-full text-lg"
                maxLength={40}
                onChange={(event) => setContactNumber(event.target.value)}
                type="tel"
                value={contactNumber}
              />
            </label>
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('notes')}</span>
              <textarea
                className="textarea textarea-bordered w-full text-base"
                maxLength={500}
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
            {addCustomer.error && (
              <p className="alert alert-error" role="alert">
                {addCustomer.error.message}
              </p>
            )}
            <button
              aria-busy={addCustomer.isPending}
              className="btn btn-secondary min-h-14 text-base"
              disabled={addCustomer.isPending}
              type="submit"
            >
              {addCustomer.isPending ? translate('saving') : translate('saveCustomer')}
            </button>
          </div>
        </form>
      )}

      <form
        className="customer-search join w-full"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(searchText.trim())
        }}
      >
        <input
          aria-label={translate('searchCustomers')}
          className="input input-bordered join-item min-w-0 flex-1 bg-base-100 text-base"
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={translate('searchCustomers')}
          value={searchText}
        />
        <button className="btn btn-accent join-item min-h-12" type="submit">
          {translate('search')}
        </button>
      </form>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-base font-semibold">
        <input
          checked={includeArchived}
          className="archived-customers-checkbox"
          onChange={(event) => setIncludeArchived(event.target.checked)}
          type="checkbox"
        />
        <span>{translate('showArchivedCustomers')}</span>
      </label>

      {customers.isPending ? (
        <FeedbackState type="loading" title={translate('loadingCustomers')} />
      ) : customers.isError ? (
        <FeedbackState
          actionLabel={translate('tryAgain')}
          description={customers.error.message}
          onAction={() => void customers.refetch()}
          title={translate('couldNotLoadCustomers')}
          type="error"
        />
      ) : customers.data.data.length === 0 ? (
        <FeedbackState
          description={translate('emptyCustomersDescription')}
          title={translate('emptyCustomers')}
          type="empty"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {customers.data.data.map((customer) => (
            <li key={customer.id}>
              <Link
                className="card border-2 border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                to={`/customers/${customer.id}`}
              >
                <div className="card-body flex-row items-center gap-4 p-5">
                  <span
                    aria-hidden="true"
                    className="grid size-14 shrink-0 place-items-center rounded-full bg-secondary/15 text-2xl font-bold text-primary"
                  >
                    {customer.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-lg font-bold">{customer.name}</span>
                    {customer.archivedAt && (
                      <span className="badge badge-warning mt-1">{translate('archived')}</span>
                    )}
                    <span className="mt-1 block text-base-content/70">
                      {customer.contactNumber || translate('noContactNumber')}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-primary">›</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
