import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useToast } from '../state/toast'

const toneStyles = {
  info: { border: 'border-line-strong', text: 'text-accent', Icon: Info },
  success: { border: 'border-success/40', text: 'text-success', Icon: CheckCircle2 },
  warning: { border: 'border-gold/40', text: 'text-gold', Icon: TriangleAlert },
  danger: { border: 'border-danger/40', text: 'text-danger', Icon: TriangleAlert },
} as const

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { border, text, Icon } = toneStyles[toast.tone]
        return (
          <div
            key={toast.id}
            className={`card animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 border px-4 py-3 ${border}`}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${text}`} />
            <p className="min-w-0 flex-1 text-sm text-ink">{toast.message}</p>
            {toast.action ? (
              <button
                type="button"
                className="shrink-0 text-sm font-semibold text-accent hover:underline"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="shrink-0 text-faint transition-colors hover:text-ink"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
