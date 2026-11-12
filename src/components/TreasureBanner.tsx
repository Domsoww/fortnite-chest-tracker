import { ArrowUpRight, BellOff, CloudOff, Coins, Gem, Hourglass } from 'lucide-react'
import { useTracker } from '../state/tracker'
import { useTreasure } from '../state/treasure'
import {
  formatCountdown,
  pragueDate,
  pragueRange,
  pragueZoneName,
  viewerTime,
  viewerZone,
  viewerZoneName,
} from '../lib/prague'
import type { TreasureWindow } from '../types'

/** Compact Treasure Hours card for the dashboard. The full schedule, sources
 *  and reminder settings live on the Treasure Hours page. */
export function TreasureBanner({ onOpen }: { onOpen: () => void }) {
  const { treasureSettings, treasure } = useTracker()
  const { state, now } = useTreasure()

  if (!treasureSettings.enabled) return null

  const active = state.current
  const next = state.next

  return (
    <section
      className={`card relative overflow-hidden p-5 ${active ? 'treasure-live' : ''}`}
      aria-live="polite"
    >
      {active ? <span aria-hidden="true" className="treasure-sheen" /> : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`treasure-icon ${active ? 'is-live' : ''}`}>
            <Gem size={18} />
          </span>
          <div>
            <span className="label text-gold">Treasure Hours</span>
            <p className="text-sm font-bold text-ink">
              {active
                ? 'Active right now'
                : next
                  ? 'Next window announced'
                  : state.phase === 'unknown'
                    ? 'No schedule available'
                    : 'Nothing announced yet'}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onOpen}>
          Details <ArrowUpRight size={14} />
        </button>
      </div>

      {active ? (
        <Live window={active} now={now} />
      ) : next ? (
        <Upcoming window={next} now={now} />
      ) : (
        <p className="relative mt-3 text-sm text-muted">
          {state.phase === 'unknown'
            ? 'The schedule could not be loaded, so no dates can be shown. Nothing is guessed here.'
            : 'Every window in the schedule has already finished. New ones appear when Epic announces them.'}
        </p>
      )}

      {treasure.lastError ? (
        <p className="relative mt-3 flex items-center gap-1.5 text-xs text-faint">
          <CloudOff size={13} /> Showing a saved schedule — {treasure.lastError}.
        </p>
      ) : null}
      {!treasureSettings.notifications ? (
        <p className="relative mt-2 flex items-center gap-1.5 text-xs text-faint">
          <BellOff size={13} /> Reminders are off.
        </p>
      ) : null}
    </section>
  )
}

function Live({ window: w, now }: { window: TreasureWindow; now: number }) {
  const remaining = Math.max(0, w.endsAt - now)
  const elapsed = Math.max(0, now - w.startsAt)
  const pct = Math.min(100, (elapsed / Math.max(1, w.endsAt - w.startsAt)) * 100)

  return (
    <div className="relative mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label">Ends in</span>
          <p className="tabular text-3xl font-black leading-none text-gold">
            {formatCountdown(remaining)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted">{pragueRange(w.startsAt, w.endsAt)}</p>
          <Multiplier window={w} />
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-[color-mix(in_srgb,var(--gold)_40%,var(--accent))]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Upcoming({ window: w, now }: { window: TreasureWindow; now: number }) {
  const until = Math.max(0, w.startsAt - now)
  const other = viewerZone()

  return (
    <div className="relative mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label">Starts in</span>
          <p className="tabular text-3xl font-black leading-none text-ink">
            {formatCountdown(until)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-ink">{pragueDate(w.startsAt)}</p>
          <p className="text-xs text-muted">
            <Hourglass size={11} className="mr-1 inline" />
            {pragueRange(w.startsAt, w.endsAt)}
          </p>
          {other ? (
            <p className="text-[11px] text-faint">
              {viewerTime(w.startsAt)}–{viewerTime(w.endsAt)} {viewerZoneName(w.startsAt)} your time
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip window={w} />
        <Multiplier window={w} />
      </div>
    </div>
  )
}

export function StatusChip({ window: w }: { window: TreasureWindow }) {
  if (w.status === 'confirmed') {
    return <span className="chip border-success/40 text-success">Confirmed by Epic</span>
  }
  if (w.status === 'manual') {
    return <span className="chip">Added by you</span>
  }
  return <span className="chip border-gold/40 text-gold">Reported, not confirmed</span>
}

export function Multiplier({ window: w }: { window: TreasureWindow }) {
  if (w.multiplier === null) {
    return <span className="text-xs text-faint">Multiplier not announced</span>
  }
  if (!w.multiplierConfirmed) {
    return (
      <span className="text-xs text-faint">
        {w.multiplier}× reported, unconfirmed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-gold">
      <Coins size={12} /> {w.multiplier}× token odds
    </span>
  )
}

/** Prague is the reference zone everywhere in this feature. */
export function zoneNote(ts: number): string {
  return `times in Prague (${pragueZoneName(ts)})`
}
