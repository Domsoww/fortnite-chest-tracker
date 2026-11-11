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

export interface Session {
  id: string
  name: string
  /** Epoch milliseconds. */
  startedAt: number
  /** Epoch milliseconds, or null while the session is still running. */
  endedAt: number | null
  events: ChestEvent[]
}

export type ThemeMode = 'dark' | 'light'
export type AccentName = 'violet' | 'azure' | 'gold' | 'mint'

export interface Settings {
  theme: ThemeMode
  accent: AccentName
  /** Ask before resetting the running counter. */
  confirmReset: boolean
  /** Big counter animations and transitions. */
  animations: boolean
  /** Short click when a chest is registered (generated with WebAudio, no asset). */
  sound: boolean
  /** Space / Enter anywhere on the dashboard registers a chest. */
  hotkeys: boolean
  /** Personal goal used by the dashboard's daily progress ring. */
  dailyGoal: number
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
