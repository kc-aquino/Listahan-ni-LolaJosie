import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../app/LanguageProvider'
import { getHealth } from '../../lib/api'

export function ConnectionStatus() {
  const { translate } = useLanguage()
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  })

  const message = isPending
    ? translate('connectionChecking')
    : isError
      ? translate('connectionBad')
      : data?.status === 'ok'
        ? translate('connectionGood')
        : translate('connectionBad')

  const state = isPending
    ? 'checking'
    : isError || data?.status !== 'ok'
      ? 'offline'
      : 'online'

  return (
    <span aria-live="polite" className="connection-indicator" data-state={state} title={message}>
      <svg aria-hidden="true" viewBox="0 0 12 28" fill="currentColor">
        <path d="M3 0h6L8 18H4Z" />
        <circle className="connection-indicator-dot" cx="6" cy="25" r="3" />
      </svg>
      <span className="sr-only">! {message}</span>
    </span>
  )
}
