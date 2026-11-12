import type {
  AppData,
  ChestEvent,
  DesktopSettings,
  ExportFile,
  HotkeyAction,
  HotkeyBinding,
  HotkeyMap,
  PauseSpan,
  Session,
  Settings,
  TreasureCache,
  TreasureLead,
  TreasureSettings,
  TreasureWindow,
} from '../types'
import {
  ALL_LEADS,
  DEFAULT_FEED_URL,
  defaultTreasureSettings,
  emptyTreasureCache,
  parseWindow,
  parseFeed,
  sortWindows,
} from './treasure'

export const STORAGE_KEY = 'fortnite-chest-tracker:v1'
/** v1 → v2 added session pauses and the desktop settings block.
 *  v2 → v3 added the Treasure Hours schedule cache, its settings, and an
 *  optional window tag on each chest event. Every step is additive, and the
 *  key above is deliberately unchanged so existing data is picked up and
 *  migrated in place rather than orphaned. */
export const SCHEMA_VERSION = 3
export const APP_ID = 'fortnite-chest-tracker'
/** File name used by the desktop build inside the app data directory. */
export const DATA_FILE = 'chest-tracker-data.json'

export const hotkeyActions: HotkeyAction[] = ['add', 'remove', 'undo', 'togglePause']

export const hotkeyLabels: Record<HotkeyAction, string> = {
  add: 'Add one chest',
  remove: 'Remove one chest',
  undo: 'Undo last action',
  togglePause: 'Pause / resume session',
}

export function defaultHotkeys(): HotkeyMap {
  return {
    add: { accelerator: 'CommandOrControl+Shift+1', enabled: true },
    remove: { accelerator: 'CommandOrControl+Shift+2', enabled: true },
    undo: { accelerator: 'CommandOrControl+Shift+3', enabled: true },
    togglePause: { accelerator: 'CommandOrControl+Shift+4', enabled: true },
  }
}

export function defaultDesktopSettings(): DesktopSettings {
  return {
    globalShortcuts: true,
    hotkeys: defaultHotkeys(),
    minimizeToTray: true,
    startWithWindows: false,
    gamingMode: true,
    soundVolume: 0.6,
  }
}

export const defaultSettings: Settings = {
  theme: 'dark',
  accent: 'violet',
  confirmReset: true,
  animations: true,
  // The desktop build counts chests while the window is hidden, so audible
  // confirmation is on by default; the web build respects the same switch.
  sound: true,
  hotkeys: true,
  dailyGoal: 50,
  desktop: defaultDesktopSettings(),
  treasure: defaultTreasureSettings(),
}

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    sessions: [],
    activeSessionId: null,
    settings: freshSettings(),
    treasure: emptyTreasureCache(),
  }
}

/** A settings object with its own nested objects, never shared by reference. */
export function freshSettings(): Settings {
  return {
    ...defaultSettings,
    desktop: defaultDesktopSettings(),
    treasure: defaultTreasureSettings(),
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  ok: boolean
  data?: AppData
  errors: string[]
  warnings: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseEvent(raw: unknown, warnings: string[], where: string): ChestEvent | null {
  if (!isObj(raw)) {
    warnings.push(`${where}: skipped an entry that is not an object.`)
    return null
  }
  if (!isFiniteNumber(raw.ts) || !isFiniteNumber(raw.delta)) {
    warnings.push(`${where}: skipped an entry with a missing timestamp or amount.`)
    return null
  }
  const delta = Math.trunc(raw.delta)
  if (delta === 0) return null
  const event: ChestEvent = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Math.trunc(raw.ts),
    delta,
    kind: raw.kind === 'adjust' ? 'adjust' : 'chest',
  }
  if (typeof raw.th === 'string' && raw.th.trim()) event.th = raw.th.trim().slice(0, 80)
  return event
}

function parsePauses(raw: unknown, warnings: string[], where: string): PauseSpan[] {
  if (raw === undefined) return [] // v1 data simply had no pauses
  if (!Array.isArray(raw)) {
    warnings.push(`${where}: the pause list was not a list and was dropped.`)
    return []
  }
  const spans: PauseSpan[] = []
  for (const entry of raw) {
    if (!isObj(entry) || !isFiniteNumber(entry.from)) continue
    const from = Math.trunc(entry.from)
    const to = isFiniteNumber(entry.to) ? Math.trunc(entry.to) : null
    if (to !== null && to < from) continue
    spans.push({ from, to })
  }
  return spans.sort((a, b) => a.from - b.from)
}

function parseSession(raw: unknown, index: number, warnings: string[]): Session | null {
  const where = `Session #${index + 1}`
  if (!isObj(raw)) {
    warnings.push(`${where}: skipped, not an object.`)
    return null
  }
  if (!isFiniteNumber(raw.startedAt)) {
    warnings.push(`${where}: skipped, missing a valid start time.`)
    return null
  }

  const events: ChestEvent[] = Array.isArray(raw.events)
    ? raw.events
        .map((e) => parseEvent(e, warnings, where))
        .filter((e): e is ChestEvent => e !== null)
        .sort((a, b) => a.ts - b.ts)
    : []

  // Older or hand-written files may only carry a total. Rebuild one event
  // from it so statistics and charts still have something to work with.
  if (events.length === 0 && isFiniteNumber(raw.count) && Math.trunc(raw.count) > 0) {
    events.push({
      id: `${raw.startedAt}-imported`,
      ts: Math.trunc(raw.startedAt),
      delta: Math.trunc(raw.count),
      kind: 'adjust',
    })
    warnings.push(`${where}: no event history, rebuilt the total as a single adjustment.`)
  }

  const startedAt = Math.trunc(raw.startedAt)
  const endedAtRaw = raw.endedAt
  let endedAt: number | null = isFiniteNumber(endedAtRaw) ? Math.trunc(endedAtRaw) : null
  if (endedAt !== null && endedAt < startedAt) {
    warnings.push(`${where}: end time was before the start time, it was cleared.`)
    endedAt = null
  }

  const pauses = parsePauses(raw.pauses, warnings, where)
  // A finished session can never still be paused.
  if (endedAt !== null) {
    for (const span of pauses) if (span.to === null) span.to = endedAt
  }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${startedAt}-${index}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Session',
    startedAt,
    endedAt,
    events,
    pauses,
  }
}

/** Accelerators are stored as text; keep only shapes the OS could accept. */
function parseAccelerator(raw: unknown, fallback: string, warnings: string[]): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  if (!value || value.length > 64 || !/^[A-Za-z0-9+ ]+$/.test(value)) {
    warnings.push(`Shortcut "${String(raw).slice(0, 24)}" is not a valid combination, the default was used.`)
    return fallback
  }
  return value
}

function parseHotkeys(raw: unknown, warnings: string[]): HotkeyMap {
  const defaults = defaultHotkeys()
  if (!isObj(raw)) return defaults
  const out = {} as HotkeyMap
  for (const action of hotkeyActions) {
    const entry = raw[action]
    const fallback = defaults[action]
    if (!isObj(entry)) {
      out[action] = fallback
      continue
    }
    const binding: HotkeyBinding = {
      accelerator: parseAccelerator(entry.accelerator, fallback.accelerator, warnings),
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : fallback.enabled,
    }
    out[action] = binding
  }
  return out
}

function parseDesktopSettings(raw: unknown, warnings: string[]): DesktopSettings {
  const s = defaultDesktopSettings()
  if (!isObj(raw)) return s
  for (const key of ['globalShortcuts', 'minimizeToTray', 'startWithWindows', 'gamingMode'] as const) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key] as boolean
  }
  if (isFiniteNumber(raw.soundVolume)) {
    s.soundVolume = Math.min(1, Math.max(0, raw.soundVolume))
  }
  s.hotkeys = parseHotkeys(raw.hotkeys, warnings)
  return s
}

function parseLeads(raw: unknown, fallback: TreasureLead[]): TreasureLead[] {
  if (!Array.isArray(raw)) return fallback
  const kept = ALL_LEADS.filter((lead) => raw.includes(lead))
  return kept
}

function parseTreasureSettings(raw: unknown, warnings: string[]): TreasureSettings {
  const s = defaultTreasureSettings()
  if (!isObj(raw)) return s
  for (const key of ['enabled', 'autoRefresh', 'notifications', 'sound', 'includeUnconfirmed'] as const) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key] as boolean
  }
  if (typeof raw.feedUrl === 'string') {
    const url = raw.feedUrl.trim()
    // Only an absolute http(s) address, or empty to mean "bundled copy only".
    if (!url) s.feedUrl = ''
    else if (/^https?:\/\//i.test(url)) s.feedUrl = url.slice(0, 500)
    else {
      warnings.push('The Treasure Hours schedule address was not a web address, the default was used.')
      s.feedUrl = DEFAULT_FEED_URL
    }
  }
  if (isFiniteNumber(raw.refreshMinutes)) {
    s.refreshMinutes = Math.min(1440, Math.max(5, Math.trunc(raw.refreshMinutes)))
  }
  s.leads = parseLeads(raw.leads, s.leads)
  return s
}

function parseManualWindows(raw: unknown): TreasureWindow[] {
  if (!Array.isArray(raw)) return []
  const out: TreasureWindow[] = []
  for (const entry of raw) {
    const parsed = parseWindow(entry)
    // Anything the user stored by hand stays marked as theirs.
    if (parsed) out.push({ ...parsed, status: 'manual' })
  }
  return sortWindows(out).slice(0, 200)
}

function parseTreasureCache(raw: unknown): TreasureCache {
  const cache = emptyTreasureCache()
  if (!isObj(raw)) return cache
  if (isObj(raw.feed)) {
    const parsed = parseFeed({ kind: 'treasure-hours', ...raw.feed })
    if (parsed.ok && parsed.feed) cache.feed = parsed.feed
  }
  // A restored feed is never "remote" any more: it was downloaded earlier.
  cache.origin = cache.feed ? 'cache' : 'none'
  if (isFiniteNumber(raw.fetchedAt)) cache.fetchedAt = Math.trunc(raw.fetchedAt)
  if (typeof raw.lastError === 'string') cache.lastError = raw.lastError.slice(0, 300)
  cache.manual = parseManualWindows(raw.manual)
  if (Array.isArray(raw.notified)) {
    cache.notified = raw.notified
      .filter((k): k is string => typeof k === 'string' && k.length < 100)
      .slice(-200)
  }
  return cache
}

function parseSettings(raw: unknown, warnings: string[]): Settings {
  if (!isObj(raw)) return freshSettings()
  const s: Settings = freshSettings()
  if (raw.theme === 'dark' || raw.theme === 'light') s.theme = raw.theme
  if (raw.accent === 'violet' || raw.accent === 'azure' || raw.accent === 'gold' || raw.accent === 'mint')
    s.accent = raw.accent
  for (const key of ['confirmReset', 'animations', 'sound', 'hotkeys'] as const) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key] as boolean
  }
  if (isFiniteNumber(raw.dailyGoal)) {
    s.dailyGoal = Math.min(10_000, Math.max(0, Math.trunc(raw.dailyGoal)))
  } else if (raw.dailyGoal !== undefined) {
    warnings.push('Daily goal was not a number, the default was used.')
  }
  s.desktop = parseDesktopSettings(raw.desktop, warnings)
  s.treasure = parseTreasureSettings(raw.treasure, warnings)
  return s
}

/** Validate anything that claims to be tracker data (storage or an import).
 *  Data written by schema v1 is migrated here rather than rejected. */
export function validateAppData(input: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isObj(input)) {
    return { ok: false, errors: ['The file does not contain a JSON object.'], warnings }
  }
  if (typeof input.app === 'string' && input.app !== APP_ID) {
    errors.push(`This file was exported by "${input.app}", not by Chest Tracker.`)
  }
  if (!Array.isArray(input.sessions)) {
    errors.push('The field "sessions" is missing or is not a list.')
  }
  if (isFiniteNumber(input.version) && input.version > SCHEMA_VERSION) {
    errors.push(
      `The file uses data format v${input.version}, but this app understands up to v${SCHEMA_VERSION}. Please update the app.`,
    )
  }
  if (errors.length > 0) return { ok: false, errors, warnings }

  const sessions = (input.sessions as unknown[])
    .map((s, i) => parseSession(s, i, warnings))
    .filter((s): s is Session => s !== null)
    .sort((a, b) => b.startedAt - a.startedAt)

  // Only one session may be running, and it must exist.
  let activeSessionId: string | null =
    typeof input.activeSessionId === 'string' ? input.activeSessionId : null
  const active = sessions.find((s) => s.id === activeSessionId)
  if (activeSessionId && !active) {
    warnings.push('The running session referenced in the file was not found, so no session is active.')
    activeSessionId = null
  } else if (active && active.endedAt !== null) {
    warnings.push('The running session was already marked as finished, so no session is active.')
    activeSessionId = null
  }
  for (const s of sessions) {
    if (s.endedAt === null && s.id !== activeSessionId) {
      s.endedAt = lastEventTime(s) ?? s.startedAt
      for (const span of s.pauses) if (span.to === null) span.to = s.endedAt
      warnings.push(`"${s.name}" had no end time and was closed automatically.`)
    }
  }

  return {
    ok: true,
    data: {
      version: SCHEMA_VERSION,
      sessions,
      activeSessionId,
      settings: parseSettings(input.settings, warnings),
      treasure: parseTreasureCache(input.treasure),
    },
    errors,
    warnings,
  }
}

function lastEventTime(s: Session): number | null {
  return s.events.length ? s.events[s.events.length - 1].ts : null
}

/* ------------------------------------------------------------------ */
/* Browser localStorage access                                         */
/* ------------------------------------------------------------------ */

export type StorageStatus = 'ok' | 'unavailable' | 'quota-exceeded'

export function isStorageAvailable(): boolean {
  try {
    const probe = '__chest_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export interface LoadResult {
  data: AppData
  status: StorageStatus
  warnings: string[]
  /** False when the store held nothing at all, which first-run flows use. */
  existed: boolean
}

/** Turn a raw stored string into data. Never throws. */
export function parseStoredText(raw: string | null): Omit<LoadResult, 'status'> {
  if (!raw) return { data: emptyData(), warnings: [], existed: false }
  try {
    const result = validateAppData(JSON.parse(raw))
    if (!result.ok || !result.data) {
      return {
        data: emptyData(),
        warnings: ['Saved data could not be read and was ignored.'],
        existed: false,
      }
    }
    return { data: result.data, warnings: result.warnings, existed: true }
  } catch {
    return {
      data: emptyData(),
      warnings: ['Saved data was not valid JSON and was ignored.'],
      existed: false,
    }
  }
}

export function readLocalStorage(): LoadResult {
  if (!isStorageAvailable()) {
    return { data: emptyData(), status: 'unavailable', warnings: [], existed: false }
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const parsed = parseStoredText(raw)
  // Keep anything unreadable instead of letting the next save erase it.
  if (raw && !parsed.existed) {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.broken`, raw)
    } catch {
      /* the backup is best effort only */
    }
    parsed.warnings = [`${parsed.warnings[0] ?? 'Saved data was unreadable.'} A copy is kept under a ".broken" key.`]
  }
  return { ...parsed, status: 'ok' }
}

export function writeLocalStorage(data: AppData): StorageStatus {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return 'ok'
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota-exceeded'
    return 'unavailable'
  }
}

export function clearLocalStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing we can do, the in-memory reset still happens */
  }
}

/* ------------------------------------------------------------------ */
/* Export / import                                                     */
/* ------------------------------------------------------------------ */

export function buildExport(data: AppData): ExportFile {
  return {
    app: APP_ID,
    exportedAt: new Date().toISOString(),
    version: SCHEMA_VERSION,
    sessions: data.sessions,
    activeSessionId: data.activeSessionId,
    settings: data.settings,
    treasure: data.treasure,
  }
}

export function exportFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `chest-tracker-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`
}

/** Merge imported sessions into existing ones, skipping duplicate ids. */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const byId = new Map(current.sessions.map((s) => [s.id, s]))
  for (const s of incoming.sessions) {
    if (!byId.has(s.id)) byId.set(s.id, s)
  }
  const sessions = Array.from(byId.values()).sort((a, b) => b.startedAt - a.startedAt)
  const activeStillValid =
    current.activeSessionId !== null && sessions.some((s) => s.id === current.activeSessionId)
  // Hand-entered windows from the other device are worth keeping; the cached
  // feed is not, since it is re-downloaded anyway.
  const manualById = new Map(current.treasure.manual.map((w) => [w.id, w]))
  for (const w of incoming.treasure?.manual ?? []) {
    if (!manualById.has(w.id)) manualById.set(w.id, w)
  }

  return {
    version: SCHEMA_VERSION,
    sessions,
    activeSessionId: activeStillValid ? current.activeSessionId : null,
    settings: current.settings,
    treasure: { ...current.treasure, manual: sortWindows(Array.from(manualById.values())) },
  }
}
