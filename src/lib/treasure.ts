/** Treasure Hours: the pure logic. Parsing a published schedule, deciding
 *  which window is running, which reminders are due, and how many chests were
 *  opened inside a window.
 *
 *  Nothing here invents a window or a multiplier. A schedule entry exists only
 *  because it was in the feed or the user typed it in, and a multiplier is
 *  shown only when the entry carries one. */

import type {
  ChestEvent,
  FeedOrigin,
  Session,
  TreasureBoost,
  TreasureCache,
  TreasureFeed,
  TreasureLead,
  TreasureSettings,
  TreasureSource,
  TreasureStatus,
  TreasureWindow,
} from '../types'

/** Published alongside the app, so the fallback is always in the bundle. */
export const BUNDLED_FEED_PATH = 'treasure-hours.json'
export const DEFAULT_FEED_URL =
  'https://domsoww.github.io/fortnite-chest-tracker/treasure-hours.json'

export const FEED_FORMAT = 1
export const ALL_LEADS: TreasureLead[] = [30, 15, 5, 0]

/** A reminder this far past its moment is stale and is not fired at all. */
export const LEAD_GRACE_MS = 90_000

export function defaultTreasureSettings(): TreasureSettings {
  return {
    enabled: true,
    feedUrl: DEFAULT_FEED_URL,
    autoRefresh: true,
    refreshMinutes: 30,
    notifications: true,
    leads: [15, 5, 0],
    sound: true,
    includeUnconfirmed: true,
  }
}

export function emptyTreasureCache(): TreasureCache {
  return {
    feed: null,
    origin: 'none',
    fetchedAt: null,
    lastError: null,
    manual: [],
    notified: [],
  }
}

/* ------------------------------------------------------------------ */
/* Feed parsing                                                        */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Accepts an ISO instant and returns epoch ms, or null. A string without an
 *  explicit zone is rejected rather than guessed at, because guessing is how
 *  a schedule ends up an hour out. */
export function parseInstant(raw: unknown): number | null {
  if (isNum(raw)) return Math.trunc(raw)
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text)) return null
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : null
}

function parseSources(raw: unknown): TreasureSource[] {
  if (!Array.isArray(raw)) return []
  const out: TreasureSource[] = []
  for (const entry of raw) {
    if (!isObj(entry) || typeof entry.label !== 'string' || !entry.label.trim()) continue
    const source: TreasureSource = { label: entry.label.trim().slice(0, 120) }
    // Only http(s) links are kept; anything else would not be openable anyway.
    if (typeof entry.url === 'string' && /^https?:\/\//i.test(entry.url)) source.url = entry.url
    if (typeof entry.verifiedAt === 'string' && parseInstant(entry.verifiedAt) !== null) {
      source.verifiedAt = entry.verifiedAt
    }
    out.push(source)
  }
  return out
}

function parseBoosts(raw: unknown): TreasureBoost[] {
  if (!Array.isArray(raw)) return []
  const out: TreasureBoost[] = []
  for (const entry of raw) {
    if (!isObj(entry) || typeof entry.label !== 'string') continue
    if (!isNum(entry.multiplier) || entry.multiplier <= 0) continue
    out.push({ label: entry.label.trim().slice(0, 60), multiplier: entry.multiplier })
  }
  return out
}

function parseStatus(raw: unknown): TreasureStatus {
  return raw === 'confirmed' ? 'confirmed' : raw === 'manual' ? 'manual' : 'reported'
}

export function parseWindow(raw: unknown): TreasureWindow | null {
  if (!isObj(raw)) return null
  const startsAt = parseInstant(raw.startsAt)
  const endsAt = parseInstant(raw.endsAt)
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return null
  // A single window longer than a day is a data error, not a Treasure Hour.
  if (endsAt - startsAt > 86_400_000) return null

  const multiplier = isNum(raw.multiplier) && raw.multiplier > 0 ? raw.multiplier : null
  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : `th-${new Date(startsAt).toISOString()}`,
    startsAt,
    endsAt,
    status: parseStatus(raw.status),
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 80) : undefined,
    multiplier,
    // A multiplier is "confirmed" only when the feed says so explicitly.
    multiplierConfirmed: multiplier !== null && raw.multiplierConfirmed === true,
    boosts: parseBoosts(raw.boosts),
    sources: parseSources(raw.sources),
  }
}

export interface FeedParseResult {
  ok: boolean
  feed?: TreasureFeed
  error?: string
  /** Entries that were dropped, so the UI can admit the feed was imperfect. */
  skipped: number
}

export function parseFeed(input: unknown): FeedParseResult {
  if (!isObj(input)) return { ok: false, error: 'The schedule is not a JSON object.', skipped: 0 }
  if (input.kind !== undefined && input.kind !== 'treasure-hours') {
    return { ok: false, error: 'That file is not a Treasure Hours schedule.', skipped: 0 }
  }
  if (isNum(input.version) && input.version > FEED_FORMAT) {
    return {
      ok: false,
      error: `The schedule uses format v${input.version}; this app reads up to v${FEED_FORMAT}. Please update the app.`,
      skipped: 0,
    }
  }
  if (!Array.isArray(input.windows)) {
    return { ok: false, error: 'The schedule has no "windows" list.', skipped: 0 }
  }

  let skipped = 0
  const windows: TreasureWindow[] = []
  for (const raw of input.windows) {
    const parsed = parseWindow(raw)
    if (parsed) windows.push(parsed)
    else skipped++
  }

  const odds = isObj(input.baseOdds) && isNum(input.baseOdds.perChest) && input.baseOdds.perChest > 0
    ? {
        perChest: Math.round(input.baseOdds.perChest),
        confirmed: input.baseOdds.confirmed === true,
        sources: parseSources(input.baseOdds.sources),
      }
    : null

  return {
    ok: true,
    skipped,
    feed: {
      version: isNum(input.version) ? input.version : FEED_FORMAT,
      generatedAt: parseInstant(input.generatedAt),
      notice: typeof input.notice === 'string' ? input.notice.slice(0, 400) : null,
      baseOdds: odds,
      windows: sortWindows(windows),
    },
  }
}

export function sortWindows(windows: TreasureWindow[]): TreasureWindow[] {
  return [...windows].sort((a, b) => a.startsAt - b.startsAt)
}

/** Feed windows plus the user's own, de-duplicated by id. A manual entry wins,
 *  because the user edited it on purpose. */
export function allWindows(cache: TreasureCache, settings: TreasureSettings): TreasureWindow[] {
  const byId = new Map<string, TreasureWindow>()
  for (const w of cache.feed?.windows ?? []) {
    if (!settings.includeUnconfirmed && w.status === 'reported') continue
    byId.set(w.id, w)
  }
  for (const w of cache.manual) byId.set(w.id, w)
  return sortWindows(Array.from(byId.values()))
}

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

export type TreasurePhase = 'active' | 'upcoming' | 'inactive' | 'unknown'

export interface TreasureState {
  phase: TreasurePhase
  /** The window running right now. */
  current: TreasureWindow | null
  /** The next window that has not started yet. */
  next: TreasureWindow | null
  /** Milliseconds until `next` starts, or null. */
  msToStart: number | null
  /** Milliseconds until `current` ends, or null. */
  msToEnd: number | null
  /** Windows that already finished, newest first. */
  past: TreasureWindow[]
  /** Windows that have not started yet, soonest first. */
  future: TreasureWindow[]
}

/** `unknown` is used when there is no schedule at all — the app says so
 *  rather than claiming there is no Treasure Hour. */
export function treasureState(windows: TreasureWindow[], now: number): TreasureState {
  if (windows.length === 0) {
    return {
      phase: 'unknown',
      current: null,
      next: null,
      msToStart: null,
      msToEnd: null,
      past: [],
      future: [],
    }
  }

  const sorted = sortWindows(windows)
  const current = sorted.find((w) => now >= w.startsAt && now < w.endsAt) ?? null
  const future = sorted.filter((w) => w.startsAt > now)
  const past = sorted.filter((w) => w.endsAt <= now).reverse()
  const next = future[0] ?? null

  return {
    phase: current ? 'active' : next ? 'upcoming' : 'inactive',
    current,
    next,
    msToStart: next ? next.startsAt - now : null,
    msToEnd: current ? current.endsAt - now : null,
    past,
    future,
  }
}

/** The window covering an instant, used to classify chests after the fact. */
export function windowAt(windows: TreasureWindow[], ts: number): TreasureWindow | null {
  return windows.find((w) => ts >= w.startsAt && ts < w.endsAt) ?? null
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

export interface DueReminder {
  /** "windowId:lead" — the key that stops it firing twice. */
  key: string
  window: TreasureWindow
  lead: TreasureLead
}

export function reminderKey(windowId: string, lead: TreasureLead): string {
  return `${windowId}:${lead}`
}

/** Which reminders should fire at `now`.
 *
 *  A reminder fires once its moment has passed and only inside a short grace
 *  period, so starting the app hours later does not spray old reminders. The
 *  caller records the returned keys, which is what makes this idempotent
 *  across refreshes and restarts. */
export function dueReminders(
  windows: TreasureWindow[],
  settings: TreasureSettings,
  notified: Iterable<string>,
  now: number,
): DueReminder[] {
  if (!settings.notifications || settings.leads.length === 0) return []
  const seen = new Set(notified)
  const out: DueReminder[] = []

  for (const w of windows) {
    // Nothing to remind about once a window has started; the 0-minute lead is
    // handled by its own moment below.
    if (w.endsAt <= now) continue
    for (const lead of settings.leads) {
      const moment = w.startsAt - lead * 60_000
      if (moment > now) continue
      if (now - moment > LEAD_GRACE_MS) continue
      const key = reminderKey(w.id, lead)
      if (seen.has(key)) continue
      out.push({ key, window: w, lead })
    }
  }

  return out
}

/** Keeps the fired-reminder list from growing without bound. */
export function rememberNotified(existing: string[], keys: string[], limit = 200): string[] {
  const merged = [...existing.filter((k) => !keys.includes(k)), ...keys]
  return merged.slice(-limit)
}

export function reminderText(r: DueReminder): { title: string; body: string } {
  const multiplier =
    r.window.multiplier !== null && r.window.multiplierConfirmed
      ? ` Token odds ${r.window.multiplier}×.`
      : ''
  if (r.lead === 0) {
    return {
      title: 'Treasure Hour has started',
      body: `${r.window.label ?? 'Treasure Hour'} is live now.${multiplier}`,
    }
  }
  return {
    title: `Treasure Hour in ${r.lead} minutes`,
    body: `${r.window.label ?? 'Treasure Hour'} starts soon.${multiplier}`,
  }
}

/* ------------------------------------------------------------------ */
/* Chest statistics                                                    */
/* ------------------------------------------------------------------ */

export interface TreasureSplit {
  /** Chests opened while a Treasure Hour was running. */
  inside: number
  /** Chests opened at any other time. */
  outside: number
  /** Chests recorded before this feature existed, so untagged and outside any
   *  window the app knows about. Reported separately to stay honest. */
  untagged: number
  /** Per-window totals, newest window first. */
  perWindow: { window: TreasureWindow; chests: number }[]
}

/** True when an event is known to have happened inside a window.
 *
 *  A tag written at counting time wins. Events without one — everything
 *  recorded before this feature shipped — are matched against the schedule
 *  instead, so old history is still classified where the schedule reaches. */
export function eventWindow(
  event: ChestEvent,
  windows: TreasureWindow[],
): TreasureWindow | null {
  if (event.th) {
    const tagged = windows.find((w) => w.id === event.th)
    if (tagged) return tagged
  }
  return windowAt(windows, event.ts)
}

export function treasureSplit(sessions: Session[], windows: TreasureWindow[]): TreasureSplit {
  const perWindow = new Map<string, number>()
  let inside = 0
  let outside = 0
  let untagged = 0
  // Chests only; a manual adjustment is not an observation of a chest opening
  // at a particular moment, so it never counts towards a window.
  const earliestWindow = windows.length ? windows[0].startsAt : null

  for (const s of sessions) {
    for (const e of s.events) {
      if (e.kind !== 'chest' || e.delta <= 0) continue
      const w = eventWindow(e, windows)
      if (w) {
        inside += e.delta
        perWindow.set(w.id, (perWindow.get(w.id) ?? 0) + e.delta)
      } else if (!e.th && earliestWindow !== null && e.ts < earliestWindow) {
        // Older than anything in the schedule: it cannot be classified either way.
        untagged += e.delta
      } else {
        outside += e.delta
      }
    }
  }

  const rows = windows
    .map((window) => ({ window, chests: perWindow.get(window.id) ?? 0 }))
    .filter((row) => row.chests > 0 || row.window.endsAt <= Date.now())
    .sort((a, b) => b.window.startsAt - a.window.startsAt)

  return { inside, outside, untagged, perWindow: rows }
}

/** Expected tokens for a number of chests at "1 in perChest" odds. Only ever
 *  called with officially published odds. */
export function expectedTokens(chests: number, perChest: number, multiplier = 1): number {
  if (perChest <= 0) return 0
  return (chests * multiplier) / perChest
}

export function describeOrigin(origin: FeedOrigin): string {
  switch (origin) {
    case 'remote':
      return 'downloaded schedule'
    case 'bundled':
      return 'schedule shipped with this version'
    case 'cache':
      return 'last downloaded schedule'
    default:
      return 'no schedule'
  }
}
