import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CloudOff,
  Coins,
  ExternalLink,
  Gem,
  Info,
  Link2,
  Package,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Card, CardHeader } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { StatCard } from '../components/StatCard'
import { Multiplier, StatusChip } from '../components/TreasureBanner'
import { useTracker } from '../state/tracker'
import { useTreasure } from '../state/treasure'
import { useToast } from '../state/toast'
import type { ConfirmOptions } from '../components/ConfirmDialog'
import type { TreasureLead, TreasureWindow } from '../types'
import { ALL_LEADS, DEFAULT_FEED_URL, describeOrigin, expectedTokens, treasureSplit } from '../lib/treasure'
import {
  formatCountdown,
  instantFromPrague,
  pragueDate,
  pragueDateTime,
  pragueRange,
  pragueZoneName,
  viewerTime,
  viewerZone,
  viewerZoneName,
} from '../lib/prague'
import { formatDecimal, formatNumber, formatRelativeDay } from '../lib/format'
import { createId } from '../lib/id'

export function Treasure({ confirm }: { confirm: (options: ConfirmOptions) => Promise<boolean> }) {
  const { data, treasureSettings, treasure, updateTreasureSettings } = useTracker()
  const { windows, refreshing, refresh, permission, askPermission, testNotification } = useTreasure()

  const split = useMemo(() => treasureSplit(data.sessions, windows), [data.sessions, windows])
  const odds = treasure.feed?.baseOdds ?? null

  return (
    <>
      <PageHeader
        eyebrow="Treasure Hours"
        title="Boosted token windows"
        description="Announced windows with better Pirate Shop Access Token odds, counted down in Prague time. Nothing on this page is guessed: a window appears only if it was announced or you added it yourself."
      />

      {!treasureSettings.enabled ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">Treasure Hours are hidden</p>
              <p className="mt-1 text-sm text-muted">
                Turn them back on to see the countdown on your dashboard.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => updateTreasureSettings({ enabled: true })}
            >
              <Gem size={16} /> Enable
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Hero />

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-5">
              <Schedule />
              <ManualWindows confirm={confirm} />
            </div>

            <div className="flex flex-col gap-5">
              <Reminders
                permission={permission}
                askPermission={askPermission}
                testNotification={testNotification}
              />

              {/* Chests inside vs. outside windows */}
              <Card className="p-5">
                <CardHeader
                  title="Your chests"
                  subtitle="Split by whether a window was running"
                  icon={<Package size={18} />}
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="In Treasure Hours"
                    value={formatNumber(split.inside)}
                    hint="chests opened"
                    icon={<Gem size={16} />}
                    tone="gold"
                  />
                  <StatCard
                    label="Outside"
                    value={formatNumber(split.outside)}
                    hint="chests opened"
                    icon={<Clock size={16} />}
                  />
                </div>
                {split.untagged > 0 ? (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-faint">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    {formatNumber(split.untagged)} chests were recorded before any window in the
                    schedule, so they cannot be placed either way.
                  </p>
                ) : null}
                {odds ? (
                  <p className="mt-3 text-xs text-muted">
                    At the published base rate of 1 in {formatNumber(odds.perChest)} per chest, your{' '}
                    {formatNumber(split.inside + split.outside)} chests are worth about{' '}
                    <span className="tabular font-semibold text-ink">
                      {formatDecimal(
                        expectedTokens(split.inside + split.outside, odds.perChest) * 100,
                        3,
                      )}
                      %
                    </span>{' '}
                    of one token on average. Luck does the rest.
                  </p>
                ) : null}
                {split.perWindow.length > 0 ? (
                  <>
                    <div className="hairline my-4" />
                    <span className="label">Per window</span>
                    <ul className="mt-2 space-y-1.5">
                      {split.perWindow.slice(0, 8).map(({ window: w, chests }) => (
                        <li key={w.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-muted">
                            {pragueDateTime(w.startsAt)}
                          </span>
                          <span className="tabular shrink-0 font-semibold text-ink">
                            {formatNumber(chests)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Card>

              <FeedCard refreshing={refreshing} refresh={refresh} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Hero countdown                                                      */
/* ------------------------------------------------------------------ */

function Hero() {
  const { state, now } = useTreasure()
  const active = state.current
  const next = state.next
  const other = viewerZone()

  if (state.phase === 'unknown') {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<CloudOff size={24} />}
          title="No schedule available"
          description="The Treasure Hours schedule could not be loaded and nothing is cached yet. No dates are shown rather than invented ones — try refreshing below, or add a window by hand."
        />
      </Card>
    )
  }

  if (!active && !next) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Clock size={24} />}
          title="Nothing announced yet"
          description="Every window in the schedule has finished. Epic usually publishes the next set a few days ahead; refresh to pick them up."
        />
      </Card>
    )
  }

  const w = (active ?? next) as TreasureWindow
  const ms = active ? Math.max(0, w.endsAt - now) : Math.max(0, w.startsAt - now)
  const pct = active
    ? Math.min(100, ((now - w.startsAt) / Math.max(1, w.endsAt - w.startsAt)) * 100)
    : null

  return (
    <section className={`card treasure-hero relative overflow-hidden p-6 sm:p-8 ${active ? 'treasure-live' : ''}`}>
      <span aria-hidden="true" className="treasure-coins" />
      {active ? <span aria-hidden="true" className="treasure-sheen" /> : null}

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <span className={`treasure-state ${active ? 'is-active' : 'is-upcoming'}`}>
          <Gem size={14} />
          {active ? 'ACTIVE' : 'UPCOMING'}
        </span>
        <StatusChip window={w} />
      </div>

      <div className="relative mt-6 text-center">
        <span className="label">{active ? 'Window ends in' : 'Window starts in'}</span>
        <p
          className={`tabular mt-1 text-[clamp(2.75rem,11vw,5.5rem)] font-black leading-none ${
            active ? 'text-gold' : 'text-ink'
          }`}
        >
          {formatCountdown(ms)}
        </p>
        <p className="mt-2 text-sm font-semibold text-ink">{pragueDate(w.startsAt)}</p>
        <p className="text-sm text-muted">{pragueRange(w.startsAt, w.endsAt)}</p>
        {other ? (
          <p className="mt-0.5 text-xs text-faint">
            {viewerTime(w.startsAt)}–{viewerTime(w.endsAt)} {viewerZoneName(w.startsAt)} on your own
            clock
          </p>
        ) : null}
      </div>

      {pct !== null ? (
        <div className="relative mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-[color-mix(in_srgb,var(--gold)_35%,var(--accent))]"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
        <Multiplier window={w} />
        {w.boosts.map((b) => (
          <span key={b.label} className="chip border-gold/30 text-gold">
            <Coins size={12} /> {b.label} {b.multiplier}×
          </span>
        ))}
      </div>

      {active ? (
        <p className="relative mt-4 text-center text-sm font-semibold text-gold">
          Chests you count right now are recorded as Treasure Hour chests.
        </p>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Schedule list                                                       */
/* ------------------------------------------------------------------ */

function Schedule() {
  const { treasureSettings, updateTreasureSettings } = useTracker()
  const { state } = useTreasure()
  const [showPast, setShowPast] = useState(false)

  const rows = showPast ? state.past : [...(state.current ? [state.current] : []), ...state.future]

  return (
    <Card>
      <CardHeader
        title={showPast ? 'Past windows' : 'Announced windows'}
        subtitle={`All times in Prague (${pragueZoneName(Date.now())})`}
        icon={<Clock size={18} />}
        action={
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn px-3 py-1.5 text-xs ${showPast ? 'btn-ghost' : ''}`}
              onClick={() => setShowPast(false)}
            >
              Upcoming
            </button>
            <button
              type="button"
              className={`btn px-3 py-1.5 text-xs ${showPast ? '' : 'btn-ghost'}`}
              onClick={() => setShowPast(true)}
            >
              Past
            </button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Clock size={22} />}
          title={showPast ? 'No past windows recorded' : 'No upcoming windows'}
          description={
            showPast
              ? 'Windows move here once they finish.'
              : 'Nothing further has been announced. Dates are never predicted here.'
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border-t border-line">
          {rows.map((w) => (
            <WindowRow key={w.id} window={w} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={treasureSettings.includeUnconfirmed}
            onChange={(e) => updateTreasureSettings({ includeUnconfirmed: e.target.checked })}
          />
          Show windows Epic has not confirmed
        </label>
      </div>
    </Card>
  )
}

function WindowRow({ window: w }: { window: TreasureWindow }) {
  const { now } = useTreasure()
  const live = now >= w.startsAt && now < w.endsAt

  return (
    <li className={`px-5 py-4 sm:px-6 ${live ? 'bg-gold/5' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            {pragueDate(w.startsAt)}
            {live ? (
              <span className="chip border-gold/40 py-0 text-[10px] text-gold">
                <span className="animate-live size-1.5 rounded-full bg-gold" />
                Live
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-muted">{pragueRange(w.startsAt, w.endsAt)}</p>
          {w.label ? <p className="mt-0.5 text-xs text-faint">{w.label}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip window={w} />
          <Multiplier window={w} />
          {!live && w.startsAt > now ? (
            <span className="tabular text-xs text-faint">
              in {formatCountdown(w.startsAt - now)}
            </span>
          ) : null}
        </div>
      </div>

      {w.sources.length > 0 ? (
        <ul className="mt-2.5 space-y-1">
          {w.sources.map((s, i) => (
            <li key={`${w.id}-src-${i}`} className="flex items-start gap-1.5 text-xs text-faint">
              <Link2 size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-dotted hover:text-muted"
                  >
                    {s.label}
                  </a>
                ) : (
                  s.label
                )}
                {s.verifiedAt ? (
                  <span className="ml-1 opacity-80">
                    · checked {formatRelativeDay(Date.parse(s.verifiedAt)).toLowerCase()}
                  </span>
                ) : null}
                {s.url ? <ExternalLink size={10} className="ml-1 inline opacity-70" /> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

function Reminders({
  permission,
  askPermission,
  testNotification,
}: {
  permission: string
  askPermission: () => Promise<void>
  testNotification: () => Promise<void>
}) {
  const { treasureSettings, updateTreasureSettings } = useTracker()

  const toggleLead = (lead: TreasureLead) => {
    const on = treasureSettings.leads.includes(lead)
    const leads = on
      ? treasureSettings.leads.filter((l) => l !== lead)
      : ALL_LEADS.filter((l) => l === lead || treasureSettings.leads.includes(l))
    updateTreasureSettings({ leads })
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Reminders"
        subtitle="Fired once per window, never repeated"
        icon={<Bell size={18} />}
      />

      <label className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">Remind me</span>
        <input
          type="checkbox"
          checked={treasureSettings.notifications}
          onChange={(e) => updateTreasureSettings({ notifications: e.target.checked })}
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        {ALL_LEADS.map((lead) => {
          const on = treasureSettings.leads.includes(lead)
          return (
            <button
              key={lead}
              type="button"
              disabled={!treasureSettings.notifications}
              onClick={() => toggleLead(lead)}
              className={`btn px-3 py-1.5 text-xs ${on ? 'btn-primary' : ''}`}
            >
              {on ? <CheckCircle2 size={13} /> : null}
              {lead === 0 ? 'At the start' : `${lead} min before`}
            </button>
          )
        })}
      </div>

      <label className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Play the confirmation sound</span>
        <input
          type="checkbox"
          checked={treasureSettings.sound}
          onChange={(e) => updateTreasureSettings({ sound: e.target.checked })}
        />
      </label>

      <div className="hairline my-4" />

      <p className="text-xs text-muted">
        {permission === 'granted'
          ? 'System notifications are allowed, so reminders appear outside the app too.'
          : permission === 'denied'
            ? 'System notifications are blocked. Reminders will still appear inside the app.'
            : permission === 'unsupported'
              ? 'This platform has no system notifications; reminders appear inside the app.'
              : 'System notifications have not been allowed yet. Reminders appear inside the app until they are.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {permission !== 'granted' && permission !== 'unsupported' ? (
          <button type="button" className="btn" onClick={() => void askPermission()}>
            <BellRing size={15} /> Allow notifications
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => void testNotification()}>
          <Bell size={15} /> Test reminder
        </button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Manual windows                                                      */
/* ------------------------------------------------------------------ */

function ManualWindows({ confirm }: { confirm: (options: ConfirmOptions) => Promise<boolean> }) {
  const { treasure, addManualWindow, removeManualWindow } = useTracker()
  const { push } = useToast()
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('20:00')
  const [to, setTo] = useState('22:00')
  const [label, setLabel] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const startsAt = instantFromPrague(date, from)
    const endsAt = instantFromPrague(date, to)
    if (startsAt === null || endsAt === null) {
      push('Enter a date and two times, for example 2026-11-14, 20:00 and 22:00.', 'warning')
      return
    }
    if (endsAt <= startsAt) {
      push('The end time has to be after the start time.', 'warning')
      return
    }
    const window: TreasureWindow = {
      id: `manual-${createId()}`,
      startsAt,
      endsAt,
      status: 'manual',
      label: label.trim() ? label.trim().slice(0, 80) : 'Added by you',
      multiplier: null,
      multiplierConfirmed: false,
      boosts: [],
      sources: [{ label: 'Entered by hand on this device' }],
    }
    addManualWindow(window)
    setLabel('')
    push(`Window added for ${pragueDate(startsAt)}.`, 'success')
  }

  const remove = async (w: TreasureWindow) => {
    const ok = await confirm({
      title: 'Remove this window?',
      message: `${pragueDate(w.startsAt)}, ${pragueRange(w.startsAt, w.endsAt)} will no longer be tracked. Chests already recorded inside it keep their tag.`,
      confirmLabel: 'Remove window',
    })
    if (!ok) return
    removeManualWindow(w.id)
    push('Window removed.', 'info')
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Add a window yourself"
        subtitle={`Entered in Prague time (${pragueZoneName(Date.now())})`}
        icon={<CalendarPlus size={18} />}
      />

      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
        <label className="block">
          <span className="label">Date</span>
          <input
            type="date"
            className="input mt-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="label">From</span>
          <input
            type="time"
            className="input mt-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input
            type="time"
            className="input mt-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Note (optional)</span>
          <input
            className="input mt-1"
            placeholder="Where you saw it announced"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary self-end">
          <CalendarPlus size={16} /> Add
        </button>
      </form>

      {treasure.manual.length > 0 ? (
        <>
          <div className="hairline my-4" />
          <ul className="space-y-2">
            {treasure.manual.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{pragueDate(w.startsAt)}</p>
                  <p className="text-xs text-muted">{pragueRange(w.startsAt, w.endsAt)}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger px-2.5 py-1.5 text-xs"
                  onClick={() => void remove(w)}
                  aria-label={`Remove the window on ${pragueDate(w.startsAt)}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-xs text-faint">
          Useful when Epic announces a window before this app's schedule catches up. Your entries are
          never overwritten by a refresh.
        </p>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Where the schedule comes from                                       */
/* ------------------------------------------------------------------ */

function FeedCard({ refreshing, refresh }: { refreshing: boolean; refresh: () => Promise<void> }) {
  const { treasure, treasureSettings, updateTreasureSettings } = useTracker()
  const [url, setUrl] = useState(treasureSettings.feedUrl)
  const { push } = useToast()
  const odds = treasure.feed?.baseOdds ?? null

  const save = (e: FormEvent) => {
    e.preventDefault()
    const value = url.trim()
    if (value && !/^https?:\/\//i.test(value)) {
      push('Enter a full web address, or leave it empty to use the bundled schedule.', 'warning')
      return
    }
    updateTreasureSettings({ feedUrl: value })
    push('Schedule address saved — reloading it now.', 'success')
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Schedule source"
        subtitle={describeOrigin(treasure.origin)}
        icon={<Info size={18} />}
      />

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Last checked</dt>
          <dd className="text-ink">
            {treasure.fetchedAt ? pragueDateTime(treasure.fetchedAt) : 'never'}
          </dd>
        </div>
        {treasure.feed?.generatedAt ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Schedule published</dt>
            <dd className="text-ink">{pragueDateTime(treasure.feed.generatedAt)}</dd>
          </div>
        ) : null}
        {odds ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Base token odds</dt>
            <dd className="text-ink">
              1 in {formatNumber(odds.perChest)}
              {odds.confirmed ? '' : ' (unconfirmed)'}
            </dd>
          </div>
        ) : null}
      </dl>

      {odds?.sources.length ? (
        <p className="mt-2 text-xs text-faint">
          {odds.sources[0].url ? (
            <a
              href={odds.sources[0].url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted"
            >
              {odds.sources[0].label}
            </a>
          ) : (
            odds.sources[0].label
          )}
        </p>
      ) : null}

      {treasure.lastError ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-gold">
          <CloudOff size={13} className="mt-0.5 shrink-0" />
          Last download failed: {treasure.lastError}. The schedule shown is the{' '}
          {describeOrigin(treasure.origin)}.
        </p>
      ) : null}

      {treasure.feed?.notice ? (
        <p className="mt-3 text-xs text-muted">{treasure.feed.notice}</p>
      ) : null}

      <button type="button" className="btn mt-4 w-full" onClick={() => void refresh()} disabled={refreshing}>
        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        {refreshing ? 'Checking…' : 'Check for updates'}
      </button>

      <div className="hairline my-4" />

      <form onSubmit={save}>
        <label className="block">
          <span className="label">Schedule address</span>
          <input
            className="input mt-1 text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_FEED_URL}
            spellCheck={false}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="submit" className="btn px-3 py-1.5 text-xs">
            Save address
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-xs"
            onClick={() => {
              setUrl(DEFAULT_FEED_URL)
              updateTreasureSettings({ feedUrl: DEFAULT_FEED_URL })
            }}
          >
            Reset to default
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Only this address is contacted, and only to read the schedule. No session data, settings or
          identifiers ever leave the device.
        </p>
      </form>

      <div className="hairline my-4" />

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Check automatically</span>
        <input
          type="checkbox"
          checked={treasureSettings.autoRefresh}
          onChange={(e) => updateTreasureSettings({ autoRefresh: e.target.checked })}
        />
      </label>
      {treasureSettings.autoRefresh ? (
        <label className="mt-3 block">
          <span className="label">Every {treasureSettings.refreshMinutes} minutes</span>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={treasureSettings.refreshMinutes}
            onChange={(e) => updateTreasureSettings({ refreshMinutes: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>
      ) : null}
    </Card>
  )
}
