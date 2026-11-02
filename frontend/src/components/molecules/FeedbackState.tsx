type FeedbackStateType = 'loading' | 'error' | 'empty'

type FeedbackStateProps = {
  type: FeedbackStateType
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const stateSymbols: Record<Exclude<FeedbackStateType, 'loading'>, string> = {
  error: '!',
  empty: '…',
}

export function FeedbackState({
  type,
  title,
  description,
  actionLabel,
  onAction,
}: FeedbackStateProps) {
  return (
    <section
      aria-busy={type === 'loading'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className="card border-2 border-base-300 bg-base-100 p-5 text-base-content shadow-sm sm:p-6"
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-4">
        {type === 'loading' ? (
          <span
            aria-hidden="true"
            className="loading loading-spinner loading-lg mt-1 shrink-0 text-primary"
          />
        ) : (
          <span
            aria-hidden="true"
            className={`badge badge-lg mt-1 size-10 shrink-0 text-lg font-bold ${type === 'error' ? 'badge-error' : 'badge-neutral'}`}
          >
            {stateSymbols[type]}
          </span>
        )}
        <div className="min-w-0 space-y-2">
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="text-base leading-relaxed">{description}</p>}
          {actionLabel && onAction && (
            <button className="btn btn-primary mt-2" onClick={onAction} type="button">
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
