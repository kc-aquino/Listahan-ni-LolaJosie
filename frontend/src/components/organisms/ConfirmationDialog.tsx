import type { ReactNode } from 'react'
import { Icon, type IconName } from '../atoms/Icon'
import { useEffect, useId, useRef } from 'react'

type ConfirmationDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  pendingLabel: string
  isConfirming: boolean
  onConfirm: () => void
  onCancel: () => void
  icon?: IconName
  details?: { label: string; value: ReactNode; icon: IconName }[]
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  isConfirming,
  onConfirm,
  onCancel,
  icon = 'check',
  details,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      aria-busy={isConfirming}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(event) => {
        event.preventDefault()
        if (!isConfirming) onCancel()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isConfirming) onCancel()
      }}
      ref={dialogRef}
    >
      <div className="modal-box max-w-lg border-2 border-base-300 bg-base-100 p-6 text-base-content sm:p-8">
        <header className="flex items-start gap-3 border-b border-base-300 pb-4">
          <span className="category-marker"><Icon name={icon} className="size-6" /></span>
          <h2 className="min-w-0 self-center text-xl font-bold leading-snug break-words" id={titleId}>{title}</h2>
        </header>
        <p className="mt-4 whitespace-pre-line break-words text-base leading-relaxed text-base-content/80" id={descriptionId}>
          {description}
        </p>
        {details && <dl className="mt-5 grid gap-3">
          {details.map((detail, index) => <div key={index} className="rounded-box border border-base-300 bg-base-200/40 p-3">
            <dt className="form-section-label text-sm text-base-content/70"><Icon name={detail.icon} className="size-5 shrink-0" />{detail.label}</dt>
            <dd className="mt-2 whitespace-pre-line break-words font-semibold leading-relaxed">{detail.value}</dd>
          </div>)}
        </dl>}
        <div className="modal-actions mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <button
            className="btn btn-ghost"
            disabled={isConfirming}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            aria-busy={isConfirming}
            className="btn btn-primary"
            disabled={isConfirming}
            onClick={onConfirm}
            type="button"
          >
            {isConfirming ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
