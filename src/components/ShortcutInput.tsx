import { useEffect, useRef, useState } from 'react'
import { Keyboard, RotateCcw, X } from 'lucide-react'
import { acceleratorFromEvent, formatAccelerator, sortModifiers } from '../desktop/bridge'

/** Captures a real key combination instead of asking the user to type one.
 *  Rejects anything the OS cannot register, such as a bare letter. */
export function ShortcutInput({
  value,
  onChange,
  onReset,
  disabled,
  conflict,
}: {
  value: string
  onChange: (accelerator: string) => void
  onReset: () => void
  disabled?: boolean
  /** Set when another action already uses the captured combination. */
  conflict?: string | null
}) {
  const [capturing, setCapturing] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!capturing) return

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        setHint(null)
        return
      }
      const accelerator = acceleratorFromEvent(e)
      if (!accelerator) {
        setHint('Hold Ctrl, Alt or Shift together with another key.')
        return
      }
      onChange(sortModifiers(accelerator))
      setCapturing(false)
      setHint(null)
    }

    // Capture phase so the app's own Space/Enter handler never sees these.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, onChange])

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => {
            setCapturing((c) => !c)
            setHint(null)
          }}
          onBlur={() => setCapturing(false)}
          className={`tabular min-w-44 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
            capturing
              ? 'border-accent bg-surface-3 text-accent'
              : conflict
                ? 'border-danger/50 bg-danger/10 text-danger'
                : 'border-line bg-surface-2 text-ink hover:border-line-strong'
          } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          aria-label={capturing ? 'Press the new combination' : `Change shortcut, currently ${formatAccelerator(value)}`}
        >
          {capturing ? (
            <span className="inline-flex items-center gap-2">
              <Keyboard size={14} /> Press keys…
            </span>
          ) : (
            formatAccelerator(value)
          )}
        </button>
        {capturing ? (
          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={() => setCapturing(false)}
            aria-label="Cancel capture"
          >
            <X size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={onReset}
            disabled={disabled}
            title="Restore the default combination"
            aria-label="Restore the default combination"
          >
            <RotateCcw size={15} />
          </button>
        )}
      </div>
      {hint ? <p className="text-right text-[11px] text-gold">{hint}</p> : null}
      {conflict && !capturing ? (
        <p className="text-right text-[11px] text-danger">Already used by “{conflict}”.</p>
      ) : null}
    </div>
  )
}
