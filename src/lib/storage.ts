import type { AppData, ChestEvent, ExportFile, Session, Settings } from '../types'

export const STORAGE_KEY = 'fortnite-chest-tracker:v1'
export const SCHEMA_VERSION = 1
export const APP_ID = 'fortnite-chest-tracker'

export const defaultSettings: Settings = {
  theme: 'dark',
  accent: 'violet',
  confirmReset: true,
  animations: true,
  sound: false,
  hotkeys: true,
  dailyGoal: 50,
}

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    sessions: [],
    activeSessionId: null,
    settings: { ...defaultSettings },
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
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Math.trunc(raw.ts),
    delta,
    kind: raw.kind === 'adjust' ? 'adjust' : 'chest',
  }
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

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${startedAt}-${index}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Session',
    startedAt,
    endedAt,
    events,
  }
}

function parseSettings(raw: unknown, warnings: string[]): Settings {
  if (!isObj(raw)) return { ...defaultSettings }
  const s = { ...defaultSettings }
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
  return s
}

/** Validate anything that claims to be tracker data (storage or an import). */
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
    },
    errors,
    warnings,
  }
}

function lastEventTime(s: Session): number | null {
  return s.events.length ? s.events[s.events.length - 1].ts : null
}

/* ------------------------------------------------------------------ */
/* localStorage access                                                 */
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

/** Read saved data. Never throws: a corrupt entry falls back to an empty state. */
export function loadData(): { data: AppData; status: StorageStatus; warnings: string[] } {
  if (!isStorageAvailable()) {
    return { data: emptyData(), status: 'unavailable', warnings: [] }
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { data: emptyData(), status: 'ok', warnings: [] }
  try {
    const result = validateAppData(JSON.parse(raw))
    if (!result.ok || !result.data) {
      return {
        data: emptyData(),
        status: 'ok',
        warnings: ['Saved data could not be read and was ignored. A backup is kept under a ".broken" key.'],
      }
    }
    return { data: result.data, status: 'ok', warnings: result.warnings }
  } catch {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.broken`, raw)
    } catch {
      /* the backup is best effort only */
    }
    return {
      data: emptyData(),
      status: 'ok',
      warnings: ['Saved data was not valid JSON and was ignored. A copy is kept under a ".broken" key.'],
    }
  }
}

export function saveData(data: AppData): StorageStatus {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return 'ok'
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota-exceeded'
    return 'unavailable'
  }
}

export function clearStoredData(): void {
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
  return {
    version: SCHEMA_VERSION,
    sessions,
    activeSessionId: activeStillValid ? current.activeSessionId : null,
    settings: current.settings,
  }
}
