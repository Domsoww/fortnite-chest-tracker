/** One recorded change to a session's chest count. Kept so that undo,
 *  per-day statistics and the activity charts all work from real data. */
export interface ChestEvent {
  id: string
  /** Epoch milliseconds. */
  ts: number
  /** How much the counter moved. +1 for a chest, any integer for a manual edit. */
  delta: number
  kind: 'chest' | 'adjust'
  /** Id of the Treasure Hour that was running when this was recorded, if any.
   *  Added in schema v3. Events written before that carry nothing, and are
   *  classified afterwards by matching their timestamp against the schedule. */
  th?: string
}

/** A stretch of a session that does not count towards playtime. Added in
 *  schema v2 for the desktop pause/resume hotkey. */
export interface PauseSpan {
  /** Epoch milliseconds. */
  from: number
  /** Epoch milliseconds, or null while the session is still paused. */
  to: number | null
}

export interface Session {
  id: string
  name: string
  /** Epoch milliseconds. */
  startedAt: number
  /** Epoch milliseconds, or null while the session is still running. */
  endedAt: number | null
  events: ChestEvent[]
  /** Always present from schema v2 on; older data migrates to an empty list. */
  pauses: PauseSpan[]
}

export type ThemeMode = 'dark' | 'light'
export type AccentName = 'violet' | 'azure' | 'gold' | 'mint'

/** The four actions a global shortcut can trigger. */
export type HotkeyAction = 'add' | 'remove' | 'undo' | 'togglePause'

export interface HotkeyBinding {
  /** Tauri accelerator string, e.g. "CommandOrControl+Shift+1". */
  accelerator: string
  enabled: boolean
}

export type HotkeyMap = Record<HotkeyAction, HotkeyBinding>

/** Settings that only mean anything in the desktop build. The web build
 *  stores them untouched so a shared export file works in both. */
export interface DesktopSettings {
  /** Global shortcuts are registered with the OS while this is on. */
  globalShortcuts: boolean
  hotkeys: HotkeyMap
  /** Closing the window hides it to the tray instead of quitting. */
  minimizeToTray: boolean
  /** Launch the app when the user signs in to Windows. */
  startWithWindows: boolean
  /** Keeps shortcuts live and the app resident while the window is hidden. */
  gamingMode: boolean
  /** Confirmation blip after a successful counter change, 0–1. */
  soundVolume: number
}

/* ------------------------------------------------------------------ */
/* Treasure Hours                                                      */
/* ------------------------------------------------------------------ */

/** Where a scheduled window came from, so the UI can be honest about it. */
export interface TreasureSource {
  label: string
  url?: string
  /** ISO timestamp of when a human last checked this against the source. */
  verifiedAt?: string
}

/** `confirmed`  — Epic announced this window itself.
 *  `reported`   — a tracking site reports it, Epic has not confirmed it.
 *  `manual`     — the user typed it in on this device. */
export type TreasureStatus = 'confirmed' | 'reported' | 'manual'

/** An extra boost announced alongside a window, e.g. a cosmetic drop. */
export interface TreasureBoost {
  label: string
  multiplier: number
}

export interface TreasureWindow {
  id: string
  /** Absolute instants. Epoch milliseconds, converted from UTC ISO strings. */
  startsAt: number
  endsAt: number
  status: TreasureStatus
  label?: string
  /** Pirate Shop Access Token drop-rate multiplier, or null when unknown. */
  multiplier: number | null
  /** False when the multiplier is an assumption rather than an Epic figure. */
  multiplierConfirmed: boolean
  boosts: TreasureBoost[]
  sources: TreasureSource[]
}

/** The published schedule file, after validation. */
export interface TreasureFeed {
  version: number
  generatedAt: number | null
  notice: string | null
  /** Officially published base odds, as "1 in N" per chest. */
  baseOdds: { perChest: number; confirmed: boolean; sources: TreasureSource[] } | null
  windows: TreasureWindow[]
}

export type FeedOrigin = 'remote' | 'bundled' | 'cache' | 'none'

/** Cached schedule plus the bookkeeping that keeps notifications honest. */
export interface TreasureCache {
  feed: TreasureFeed | null
  /** Where the cached feed came from and when it was read. */
  origin: FeedOrigin
  fetchedAt: number | null
  lastError: string | null
  /** Windows the user entered by hand. Never overwritten by a refresh. */
  manual: TreasureWindow[]
  /** "windowId:minutesBefore" keys already fired, so nothing repeats. */
  notified: string[]
}

/** Minutes before a window that a reminder can fire. 0 means "at the start". */
export type TreasureLead = 30 | 15 | 5 | 0

export interface TreasureSettings {
  /** Shows the Treasure Hours panel and the dashboard banner. */
  enabled: boolean
  /** Where the schedule is fetched from. Overridable for a private mirror. */
  feedUrl: string
  autoRefresh: boolean
  /** How often the schedule is re-fetched, in minutes. */
  refreshMinutes: number
  notifications: boolean
  /** Which reminders are armed. */
  leads: TreasureLead[]
  /** Play the bundled blip with a reminder. */
  sound: boolean
  /** Include windows Epic has not confirmed, clearly marked as such. */
  includeUnconfirmed: boolean
}

export interface Settings {
  theme: ThemeMode
  accent: AccentName
  /** Ask before resetting the running counter. */
  confirmReset: boolean
  /** Big counter animations and transitions. */
  animations: boolean
  /** Short click when a chest is registered. */
  sound: boolean
  /** Space / Enter inside the window registers a chest. */
  hotkeys: boolean
  /** Personal goal used by the dashboard's daily progress ring. */
  dailyGoal: number
  desktop: DesktopSettings
  treasure: TreasureSettings
}

export interface AppData {
  version: number
  sessions: Session[]
  activeSessionId: string | null
  settings: Settings
  /** Schedule cache. Added in schema v3; older data starts with an empty one. */
  treasure: TreasureCache
}

/** Shape of an export file. */
export interface ExportFile extends AppData {
  app: 'fortnite-chest-tracker'
  exportedAt: string
}
