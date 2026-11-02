import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageProvider'
import { Icon } from '../atoms/Icon'

export function QuickActions() {
  const { translate } = useLanguage()

  return (
    <section aria-labelledby="quick-actions-title" className="space-y-4">
      <div>
        <p className="section-kicker text-xs font-bold tracking-[0.16em]">
          {translate('quickActionsEyebrow')}
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {translate('quickActionsTitle')}
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Link className="quick-action quick-action--debt btn btn-lg text-left text-lg" to="/debts/new">
          <span className="action-icon">
            <Icon className="size-6" name="plus" />
          </span>
          <span>{translate('addDebt')}</span>
          <Icon className="ml-auto size-5 shrink-0" name="arrow" />
        </Link>
        <Link className="quick-action quick-action--payment btn btn-lg text-left text-lg" to="/payments/new">
          <span className="action-icon">
            <Icon className="size-6" name="history" />
          </span>
          <span>{translate('receivePayment')}</span>
          <Icon className="ml-auto size-5 shrink-0" name="arrow" />
        </Link>
      </div>
    </section>
  )
}
