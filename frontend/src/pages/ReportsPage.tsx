import { DateInput } from '../components/atoms/DateInput'
import { formatDate } from '../lib/date'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useLanguage } from '../app/LanguageProvider'
import { FeedbackState } from '../components/molecules/FeedbackState'
import {
  getDailyReport,
  getMonthlyReport,
  getReportCustomers,
  getReportSummary,
} from '../lib/api'

type Granularity = 'day' | 'month'

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function ReportsPage() {
  const { translate } = useLanguage()
  const today = manilaToday()
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [dayFrom, setDayFrom] = useState(today)
  const [dayTo, setDayTo] = useState(today)
  const [monthFrom, setMonthFrom] = useState(today.slice(0, 7))
  const [monthTo, setMonthTo] = useState(today.slice(0, 7))
  const summary = useQuery({ queryKey: ['report-summary'], queryFn: getReportSummary })
  const customers = useQuery({
    queryKey: ['report-customers'],
    queryFn: getReportCustomers,
  })
  const daily = useQuery({
    queryKey: ['daily-report', dayFrom, dayTo],
    queryFn: () => getDailyReport(dayFrom, dayTo),
    enabled: granularity === 'day' && Boolean(dayFrom && dayTo),
  })
  const monthly = useQuery({
    queryKey: ['monthly-report', monthFrom, monthTo],
    queryFn: () => getMonthlyReport(monthFrom, monthTo),
    enabled: granularity === 'month' && Boolean(monthFrom && monthTo),
  })
  const periodQuery = granularity === 'day' ? daily : monthly

  return (
    <section className="grid gap-5">
      <header>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('reportsEyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{translate('reports')}</h1>
      </header>

      {summary.isPending ? (
        <FeedbackState type="loading" title={translate('loadingReport')} />
      ) : summary.isError ? (
        <FeedbackState
          description={summary.error.message}
          title={translate('couldNotLoadReport')}
          type="error"
        />
      ) : (
        <section aria-label={translate('currentBalances')} className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label={translate('moneyDebt')} value={summary.data.moneyLoan} />
          <SummaryCard label={translate('goodsDebt')} value={summary.data.storeItems} />
          <SummaryCard
            label={translate('combinedBalance')}
            value={summary.data.combined}
            emphasis
          />
        </section>
      )}

      <section className="card border-2 border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-5 sm:p-7">
          <div>
            <h2 className="text-xl font-bold">{translate('periodActivity')}</h2>
            <p className="mt-1 text-base-content/70">{translate('periodActivityDescription')}</p>
          </div>
          <div className="join w-full sm:w-fit">
            <button
              aria-pressed={granularity === 'day'}
              className={`btn join-item min-h-12 flex-1 sm:flex-none ${granularity === 'day' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setGranularity('day')}
              type="button"
            >
              {translate('daily')}
            </button>
            <button
              aria-pressed={granularity === 'month'}
              className={`btn join-item min-h-12 flex-1 sm:flex-none ${granularity === 'month' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setGranularity('month')}
              type="button"
            >
              {translate('monthly')}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('from')}</span>
              <DateInput
                className="input input-bordered w-full"
                max={granularity === 'day' ? dayTo : monthTo}
                onChange={(event) =>
                  granularity === 'day'
                    ? setDayFrom(event.target.value)
                    : setMonthFrom(event.target.value)
                }
                type={granularity === 'day' ? 'date' : 'month'}
                value={granularity === 'day' ? dayFrom : monthFrom}
              />
            </label>
            <label className="form-control gap-2">
              <span className="font-semibold">{translate('to')}</span>
              <DateInput
                className="input input-bordered w-full"
                min={granularity === 'day' ? dayFrom : monthFrom}
                onChange={(event) =>
                  granularity === 'day'
                    ? setDayTo(event.target.value)
                    : setMonthTo(event.target.value)
                }
                type={granularity === 'day' ? 'date' : 'month'}
                value={granularity === 'day' ? dayTo : monthTo}
              />
            </label>
          </div>
          <p className="text-sm text-base-content/70">{translate('grossFlowNote')}</p>
        </div>
      </section>

      {periodQuery.isPending ? (
        <FeedbackState type="loading" title={translate('loadingReport')} />
      ) : periodQuery.isError ? (
        <FeedbackState
          description={periodQuery.error.message}
          title={translate('couldNotLoadReport')}
          type="error"
        />
      ) : periodQuery.data.data.length === 0 ? (
        <FeedbackState title={translate('emptyReport')} type="empty" />
      ) : (
        <ul className="grid gap-3">
          {periodQuery.data.data.map((period) => (
            <li className="card border-2 border-base-300 bg-base-100 shadow-sm" key={formatDate(period.period, granularity === 'month')}>
              <div className="card-body gap-4 p-5">
                <h2 className="text-xl font-bold">{formatDate(period.period, granularity === 'month')}</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MeasureCard label={translate('debtAdded')} value={period.debtAdded.combined} />
                  <MeasureCard
                    label={translate('paymentsReceived')}
                    value={period.paymentsReceived.combined}
                  />
                  <MeasureCard
                    label={translate('outstandingAtEnd')}
                    value={period.outstanding.combined}
                    emphasis
                  />
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <CategoryBreakdown
                    label={translate('debtAdded')}
                    money={period.debtAdded.moneyLoan}
                    goods={period.debtAdded.storeItems}
                    translate={translate}
                  />
                  <CategoryBreakdown
                    label={translate('paymentsReceived')}
                    money={period.paymentsReceived.moneyLoan}
                    goods={period.paymentsReceived.storeItems}
                    translate={translate}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="grid gap-3">
        <h2 className="text-2xl font-bold">{translate('customerBalances')}</h2>
        {customers.isPending ? (
          <FeedbackState type="loading" title={translate('loadingCustomers')} />
        ) : customers.isError ? (
          <FeedbackState
            description={customers.error.message}
            title={translate('couldNotLoadCustomers')}
            type="error"
          />
        ) : customers.data.data.length === 0 ? (
          <FeedbackState title={translate('emptyCustomers')} type="empty" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {customers.data.data.map((customer) => (
              <li key={customer.id}>
                <Link
                  className="card border-2 border-base-300 bg-base-100 shadow-sm hover:shadow-md"
                  to={`/customers/${customer.id}`}
                >
                  <div className="card-body gap-2 p-5">
                    <h3 className="text-lg font-bold">{customer.name}</h3>
                    <p className="text-base-content/70">
                      {translate('moneyDebt')}: ₱ {customer.moneyLoan}
                    </p>
                    <p className="text-base-content/70">
                      {translate('goodsDebt')}: ₱ {customer.storeItems}
                    </p>
                    <p className="text-lg font-extrabold text-primary">
                      {translate('combinedBalance')}: ₱ {customer.combined}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function SummaryCard({
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

function MeasureCard({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <article className={`rounded-box p-4 ${emphasis ? 'bg-primary/10' : 'bg-base-200'}`}>
      <p className="text-sm font-semibold text-base-content/70">{label}</p>
      <p className="mt-1 break-all text-xl font-extrabold">₱ {value}</p>
    </article>
  )
}

function CategoryBreakdown({
  label,
  money,
  goods,
  translate,
}: {
  label: string
  money: string
  goods: string
  translate: (key: 'moneyDebt' | 'goodsDebt') => string
}) {
  return (
    <div className="rounded-box bg-base-200 p-3">
      <p className="font-bold">{label}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm text-base-content/70">{translate('moneyDebt')}</dt><dd className="mt-1 font-semibold">₱ {money}</dd></div>
        <div><dt className="text-sm text-base-content/70">{translate('goodsDebt')}</dt><dd className="mt-1 font-semibold">₱ {goods}</dd></div>
      </dl>
    </div>
  )
}
