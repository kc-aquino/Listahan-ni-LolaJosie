import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../app/LanguageProvider'
import { getReportSummary } from '../../lib/api'

const categories = [
  {
    title: 'moneyDebt',
    description: 'moneyDescription',
    marker: 'P',
  },
  {
    title: 'goodsDebt',
    description: 'goodsDescription',
    marker: 'U',
  },
] as const

export function DebtCategories() {
  const { translate } = useLanguage()
  const summary = useQuery({
    queryKey: ['report-summary'],
    queryFn: getReportSummary,
  })

  return (
    <section aria-labelledby="categories-title" className="space-y-4">
      <div>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('categoriesEyebrow')}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{translate('categoriesTitle')}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((category) => (
          <Link
            className={`category-card category-card--${category.title === 'moneyDebt' ? 'money' : 'goods'} card card-side min-h-24 transition hover:-translate-y-0.5 hover:shadow-md`}
            key={category.title}
            to="/customers"
          >
            <span className="card-body flex-row items-center gap-4 p-4">
              <span className={`category-marker category-marker--${category.title === 'moneyDebt' ? 'money' : 'goods'} badge badge-lg size-12 shrink-0 rounded-2xl text-xl font-bold`}>
                {category.marker}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <strong className="text-base">{translate(category.title)}</strong>
                <span className="text-sm text-base-content/70">{translate(category.description)}</span>
                <span aria-live="polite" className="mt-1 text-lg font-extrabold text-primary">
                  {summary.isPending
                    ? '…'
                    : summary.isError
                      ? '—'
                      : `₱ ${category.title === 'moneyDebt' ? summary.data.moneyLoan : summary.data.storeItems}`}
                </span>
              </span>
              <span aria-hidden="true" className="ml-auto text-2xl text-base-content/50">›</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-base-content/70">{translate('separateNote')}</p>
    </section>
  )
}
