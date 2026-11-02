import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../app/LanguageProvider'
import { getHealth } from '../../lib/api'

export function ConnectionStatus() {
  const { translate } = useLanguage()
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  const message = isPending
    ? translate('connectionChecking')
    : isError
      ? translate('connectionBad')
      : data?.status === 'ok'
        ? translate('connectionGood')
        : translate('connectionBad')

  const state = isPending
    ? 'status-warning'
    : isError || data?.status !== 'ok'
      ? 'status-error'
      : 'status-success'

  return (
    <p aria-live="polite" className="flex items-center gap-2 text-sm text-base-content/70">
      <span aria-hidden="true" className={`status ${state}`} />
      {message}
    </p>
  )
}
