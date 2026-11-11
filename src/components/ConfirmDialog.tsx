import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

export function ConfirmDialog({
  open,
  options,
  onConfirm,
  onCancel,
}: {
  open: boolean
  options: ConfirmOptions | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open || !options) return null
  const danger = options.tone !== 'default'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="card animate-pop w-full max-w-md p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
              danger
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-line bg-surface-3 text-accent'
            }`}
          >
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-lg font-semibold text-ink">
              {options.title}
            </h2>
            <p id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-muted">
              {options.message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn" onClick={onCancel}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
