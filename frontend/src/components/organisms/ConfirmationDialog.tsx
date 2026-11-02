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
        <h2 className="text-xl font-bold" id={titleId}>
          {title}
        </h2>
        <p className="mt-3 text-base leading-relaxed" id={descriptionId}>
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
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
