/** One recorded change to a session's chest count. Kept so that undo,
 *  per-day statistics and the activity charts all work from real data. */
export interface ChestEvent {
  id: string
  /** Epoch milliseconds. */
  ts: number
  /** How much the counter moved. +1 for a chest, any integer for a manual edit. */
  delta: number
  kind: 'chest' | 'adjust'
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
}

export interface AppData {
  version: number
  sessions: Session[]
  activeSessionId: string | null
  settings: Settings
}

/** Shape of an export file. */
export interface ExportFile extends AppData {
  app: 'fortnite-chest-tracker'
  exportedAt: string
}
