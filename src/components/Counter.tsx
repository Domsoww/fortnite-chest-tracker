import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Undo2,
  X,
} from 'lucide-react'
import { useTracker } from '../state/tracker'
import { useToast } from '../state/toast'
import { playBlockedSound, playChestSound } from '../lib/sound'
import { formatDuration, formatNumber, formatTime } from '../lib/format'
import { sessionRate } from '../lib/stats'
import type { ConfirmOptions } from './ConfirmDialog'

interface FloatLabel {
  id: number
  text: string
}

export function Counter({
  confirm,
}: {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}) {
  const {
    activeSession,
    count,
    paused,
    canUndo,
    settings,
    desktopSettings,
    addChest,
    adjust,
    setCount,
    undo,
    resetSession,
    startSession,
    endSession,
    togglePause,
  } = useTracker()
  const { push } = useToast()

  const [floats, setFloats] = useState<FloatLabel[]>([])
  const [ripples, setRipples] = useState<number[]>([])
  const [bump, setBump] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [elapsed, setElapsed] = useState(() => Date.now())
  const floatId = useRef(0)
  const editInput = useRef<HTMLInputElement>(null)

  // Live session clock. It stops while the session is paused, and also while
  // the window is hidden — in the tray there is nobody to read it, and the
  // desktop build should stay close to idle during a match.
  useEffect(() => {
    if (!activeSession || paused) return

    let timer = 0
    const start = () => {
      window.clearInterval(timer)
      setElapsed(Date.now())
      if (!document.hidden) timer = window.setInterval(() => setElapsed(Date.now()), 1000)
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', start)
    }
  }, [activeSession, paused])

  const volume = desktopSettings.soundVolume

  const spawnFeedback = useCallback(
    (text: string) => {
      const id = ++floatId.current
      setBump(id)
      if (settings.animations) {
        setFloats((list) => [...list.slice(-5), { id, text }])
        setRipples((list) => [...list.slice(-3), id])
        window.setTimeout(() => {
          setFloats((list) => list.filter((f) => f.id !== id))
          setRipples((list) => list.filter((r) => r !== id))
        }, 950)
      }
      if (settings.sound) playChestSound(volume)
    },
    [settings.animations, settings.sound, volume],
  )

  const warnPaused = useCallback(() => {
    if (settings.sound) playBlockedSound(volume)
    push('Session is paused — resume it to keep counting.', 'warning')
  }, [push, settings.sound, volume])

  const handleAdd = useCallback(() => {
    if (addChest() === 'paused') warnPaused()
    else spawnFeedback('+1')
  }, [addChest, spawnFeedback, warnPaused])

  const handleAdjust = useCallback(
    (delta: number) => {
      if (delta < 0 && count === 0) return
      if (adjust(delta) === 'paused') warnPaused()
      else spawnFeedback(delta > 0 ? `+${delta}` : `${delta}`)
    },
    [adjust, count, spawnFeedback, warnPaused],
  )

  const handleTogglePause = useCallback(() => {
    const outcome = togglePause()
    if (outcome === 'no-session') push('No session is running.', 'info')
    else push(outcome === 'paused' ? 'Session paused.' : 'Session resumed.', 'info')
  }, [togglePause, push])

  // Space / Enter anywhere registers a chest, unless the player is typing.
  useEffect(() => {
    if (!settings.hotkeys) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey && canUndo) {
          e.preventDefault()
          undo()
          push('Last action undone.', 'info')
        }
        return
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings.hotkeys, handleAdd, canUndo, undo, push])

  const beginEdit = () => {
    setEditValue(String(count))
    setEditing(true)
    window.setTimeout(() => editInput.current?.select(), 0)
  }

  const commitEdit = () => {
    const parsed = Number.parseInt(editValue, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      push('Enter a whole number of 0 or more.', 'warning')
      return
    }
    const clamped = Math.min(parsed, 1_000_000)
    setCount(clamped)
    setEditing(false)
    push(`Counter set to ${formatNumber(clamped)}.`, 'success')
  }

  const handleReset = async () => {
    if (!activeSession || count === 0) return
    if (settings.confirmReset) {
      const ok = await confirm({
        title: 'Reset this session?',
        message: `The counter for "${activeSession.name}" goes back to 0 and its ${formatNumber(
          count,
        )} recorded chests are removed. Finished sessions are not affected.`,
        confirmLabel: 'Reset counter',
      })
      if (!ok) return
    }
    resetSession()
    push('Session counter reset.', 'info')
  }

  const handleEnd = async () => {
    if (!activeSession) return
    const ok = await confirm({
      title: 'Finish this session?',
      message:
        count > 0
          ? `"${activeSession.name}" is saved to your history with ${formatNumber(count)} ${
              count === 1 ? 'chest' : 'chests'
            }.`
          : `"${activeSession.name}" has no chests yet. It is still saved to your history.`,
      confirmLabel: 'Finish session',
      tone: 'default',
    })
    if (!ok) return
    endSession()
    push('Session finished and saved.', 'success')
  }

  const rate = activeSession ? sessionRate(activeSession, elapsed) : null

  return (
    <section className="card relative overflow-hidden p-6 sm:p-8">
      {/* Decorative glow behind the counter. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 size-80 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="label">
            {activeSession ? (paused ? 'Paused session' : 'Live session') : 'Session'}
          </span>
          <p className="mt-1 truncate text-lg font-semibold text-ink">
            {activeSession ? activeSession.name : 'No session running'}
          </p>
        </div>
        {activeSession ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`chip ${paused ? 'border-gold/40 text-gold' : 'border-success/40 text-success'}`}
            >
              <span
                className={`size-1.5 rounded-full ${paused ? 'bg-gold' : 'animate-live bg-success'}`}
              />
              {paused ? 'Paused' : formatDuration(elapsed - activeSession.startedAt)}
            </span>
            <span className="chip">Started {formatTime(activeSession.startedAt)}</span>
            {rate !== null && !paused ? <span className="chip">{Math.round(rate)} chests/h</span> : null}
          </div>
        ) : (
          <span className="chip">Press the button to begin</span>
        )}
      </div>

      {/* The counter itself. */}
      <div className="relative mt-7 flex flex-col items-center">
        {editing ? (
          <form
            className="flex w-full max-w-xs flex-col items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              commitEdit()
            }}
          >
            <label className="label" htmlFor="counter-input">
              Set counter
            </label>
            <input
              id="counter-input"
              ref={editInput}
              className="input tabular text-center text-3xl font-bold"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                <Check size={16} /> Save
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                <X size={16} /> Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={beginEdit}
            title="Click to set the counter manually"
            className="group relative rounded-3xl px-4 py-1 transition-colors hover:bg-surface-2"
          >
            <span
              key={bump}
              className={`tabular block bg-gradient-to-br from-[var(--text)] via-[var(--text)] to-[color-mix(in_srgb,var(--accent)_70%,var(--text))] bg-clip-text text-[clamp(4.5rem,18vw,8.5rem)] font-black leading-none text-transparent ${
                settings.animations ? 'animate-bump' : ''
              } ${paused ? 'opacity-60' : ''}`}
            >
              {formatNumber(count)}
            </span>
            <span className="mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-faint transition-colors group-hover:text-muted">
              <Pencil size={12} /> chests this session
            </span>
            {floats.map((f) => (
              <span
                key={f.id}
                aria-hidden="true"
                className="animate-rise pointer-events-none absolute left-1/2 top-2 text-2xl font-black text-gold"
              >
                {f.text}
              </span>
            ))}
          </button>
        )}

        {/* Primary action */}
        <div className="relative mt-7 grid place-items-center">
          {ripples.map((r) => (
            <span
              key={r}
              aria-hidden="true"
              className="animate-ring pointer-events-none absolute size-40 rounded-full border-2 border-accent sm:size-48"
            />
          ))}
          <button
            type="button"
            onClick={handleAdd}
            className={`btn btn-primary relative size-40 flex-col gap-1 rounded-full text-lg sm:size-48 sm:text-xl ${
              paused ? 'opacity-60' : ''
            }`}
            aria-label="Register one opened chest"
          >
            <Plus size={40} strokeWidth={3} />
            <span className="font-bold">Chest opened</span>
            {settings.hotkeys ? (
              <span className="text-[11px] font-medium text-white/70">or press Space</span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Secondary actions */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => handleAdjust(-1)}
          disabled={count === 0}
          title="Remove one chest"
        >
          <Minus size={16} /> 1
        </button>
        <button type="button" className="btn" onClick={() => handleAdjust(5)} title="Add five chests">
          <Plus size={16} /> 5
        </button>
        <button type="button" className="btn" onClick={beginEdit} disabled={editing}>
          <Pencil size={16} /> Set value
        </button>
        <button type="button" className="btn" onClick={undo} disabled={!canUndo} title="Undo last action">
          <Undo2 size={16} /> Undo
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleReset}
          disabled={!activeSession || count === 0}
        >
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      <div className="hairline my-6" />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {activeSession ? (
          <>
            <button type="button" className="btn" onClick={handleTogglePause}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? 'Resume session' : 'Pause session'}
            </button>
            <button type="button" className="btn" onClick={handleEnd}>
              <Square size={16} /> Finish session
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => startSession()}>
            <Play size={16} /> Start a session
          </button>
        )}
        {activeSession ? (
          <p className="w-full text-center text-xs text-faint">
            {paused
              ? 'Paused time is left out of this session’s duration, and chests are not counted until you resume.'
              : 'Finishing the session saves it to your history. A new one starts automatically the next time you register a chest.'}
          </p>
        ) : (
          <p className="w-full text-center text-xs text-faint">
            No session is running — registering a chest starts one for you.
          </p>
        )}
      </div>
    </section>
  )
}
