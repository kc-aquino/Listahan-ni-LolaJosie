import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../app/LanguageProvider'
import { getReportSummary } from '../../lib/api'
import { Icon } from '../atoms/Icon'
import { FeedbackState } from '../molecules/FeedbackState'

const categories = [
  {
    title: 'moneyDebt',
    description: 'moneyDescription',
    marker: '₱',
  },
  {
    title: 'goodsDebt',
    description: 'goodsDescription',
    icon: 'store',
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
        <p className="section-kicker">{translate('categoriesEyebrow')}</p>
        <h2 className="mt-2 text-2xl font-bold" id="categories-title">
          {translate('categoriesTitle')}
        </h2>
      </div>
      {summary.isPending ? (
        <FeedbackState type="loading" title={translate('loadingBalances')} />
      ) : summary.isError ? (
        <FeedbackState
          actionLabel={translate('tryAgain')}
          description={summary.error.message}
          onAction={() => void summary.refetch()}
          title={translate('couldNotLoadBalances')}
          type="error"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article className="balance-summary-card card sm:col-span-2 lg:col-span-1">
              <div className="card-body gap-1 p-5 sm:p-6">
                <h3 className="font-semibold">{translate('combinedBalance')}</h3>
                <p className="break-all text-3xl font-bold" aria-live="polite">
                  ₱ {summary.data.combined}
                </p>
              </div>
            </article>
            {categories.map((category) => (
              <article className="category-card card" key={category.title}>
                <div className="card-body flex-row items-center gap-3 p-4 sm:p-5">
                  <span aria-hidden="true" className="category-marker text-xl font-bold">
                    {'marker' in category ? (
                      category.marker
                    ) : (
                      <Icon className="size-6" name={category.icon} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-base">{translate(category.title)}</strong>
                    <span className="block text-sm text-base-content/70">
                      {translate(category.description)}
                    </span>
                    <span aria-live="polite" className="mt-2 block break-all text-xl font-bold">
                      ₱ {category.title === 'moneyDebt' ? summary.data.moneyLoan : summary.data.storeItems}
                    </span>
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className="text-base text-base-content/75">{translate('separateNote')}</p>
        </>
      )}
    </section>
  )
}
