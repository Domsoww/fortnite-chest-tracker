import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type {
  AppData,
  ChestEvent,
  DesktopSettings,
  Session,
  Settings,
  TreasureCache,
  TreasureSettings,
  TreasureWindow,
} from '../types'
import { createId } from '../lib/id'
import { isPaused, sessionCount } from '../lib/stats'
import { emptyData, mergeData, type StorageStatus } from '../lib/storage'
import { rememberNotified, sortWindows } from '../lib/treasure'
import { activeTreasureWindow } from '../lib/treasureNow'
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
  type Backend,
} from '../lib/persistence'

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

type Action =
  | { type: 'hydrate'; data: AppData }
  | { type: 'add-chest'; ts: number; th: string | null }
  | { type: 'adjust'; delta: number; ts: number }
  | { type: 'set-count'; value: number; ts: number }
  | { type: 'undo' }
  | { type: 'reset-session' }
  | { type: 'start-session'; name?: string; ts: number }
  | { type: 'end-session'; ts: number }
  | { type: 'toggle-pause'; ts: number }
  | { type: 'rename-session'; id: string; name: string }
  | { type: 'delete-session'; id: string }
  | { type: 'restore-session'; session: Session; makeActive: boolean }
  | { type: 'delete-all-sessions' }
  | { type: 'update-settings'; patch: Partial<Settings> }
  | { type: 'update-desktop-settings'; patch: Partial<DesktopSettings> }
  | { type: 'update-treasure-settings'; patch: Partial<TreasureSettings> }
  | { type: 'update-treasure-cache'; patch: Partial<TreasureCache> }
  | { type: 'add-manual-window'; window: TreasureWindow }
  | { type: 'remove-manual-window'; id: string }
  | { type: 'mark-notified'; keys: string[] }
  | { type: 'replace'; data: AppData }
  | { type: 'merge'; data: AppData }

function defaultSessionName(existing: Session[], ts: number): string {
  const sameDay = existing.filter(
    (s) => new Date(s.startedAt).toDateString() === new Date(ts).toDateString(),
  ).length
  return `Session ${sameDay + 1}`
}

function newSession(name: string, ts: number): Session {
  return { id: createId(), name, startedAt: ts, endedAt: null, events: [], pauses: [] }
}

function withActive(data: AppData, update: (s: Session) => Session): AppData {
  if (!data.activeSessionId) return data
  return {
    ...data,
    sessions: data.sessions.map((s) => (s.id === data.activeSessionId ? update(s) : s)),
  }
}

/** Close any pause that is still open, so time stops being discounted. */
function resume(s: Session, ts: number): Session {
  if (!s.pauses.some((p) => p.to === null)) return s
  return { ...s, pauses: s.pauses.map((p) => (p.to === null ? { ...p, to: ts } : p)) }
}

function pushEvent(data: AppData, event: ChestEvent): AppData {
  // Counting always happens inside a session; start one implicitly so the
  // main button is never dead.
  let next = data
  if (!next.activeSessionId) {
    const session = newSession(defaultSessionName(next.sessions, event.ts), event.ts)
    next = { ...next, sessions: [session, ...next.sessions], activeSessionId: session.id }
  }
  return withActive(next, (s) => ({ ...s, events: [...s.events, event] }))
}

export function reducer(data: AppData, action: Action): AppData {
  switch (action.type) {
    case 'hydrate':
      return action.data

    case 'add-chest': {
      const event: ChestEvent = { id: createId(), ts: action.ts, delta: 1, kind: 'chest' }
      // Stamped at the moment of counting, so a later schedule change cannot
      // move a chest in or out of a Treasure Hour after the fact.
      if (action.th) event.th = action.th
      return pushEvent(data, event)
    }

    case 'adjust': {
      if (action.delta === 0) return data
      const active = data.sessions.find((s) => s.id === data.activeSessionId)
      // Never let a counter go below zero.
      const current = active ? sessionCount(active) : 0
      const delta = Math.max(action.delta, -current)
      if (delta === 0) return data
      return pushEvent(data, { id: createId(), ts: action.ts, delta, kind: 'adjust' })
    }

    case 'set-count': {
      const target = Math.max(0, Math.trunc(action.value))
      const active = data.sessions.find((s) => s.id === data.activeSessionId)
      const current = active ? sessionCount(active) : 0
      if (target === current) return data
      return pushEvent(data, {
        id: createId(),
        ts: action.ts,
        delta: target - current,
        kind: 'adjust',
      })
    }

    case 'undo':
      return withActive(data, (s) =>
        s.events.length === 0 ? s : { ...s, events: s.events.slice(0, -1) },
      )

    case 'reset-session':
      return withActive(data, (s) => ({ ...s, events: [] }))

    case 'start-session': {
      const name = action.name?.trim() || defaultSessionName(data.sessions, action.ts)
      const session = newSession(name.slice(0, 80), action.ts)
      // Close any session that was somehow left open.
      const sessions = data.sessions.map((s) =>
        s.endedAt === null ? { ...resume(s, action.ts), endedAt: action.ts } : s,
      )
      return { ...data, sessions: [session, ...sessions], activeSessionId: session.id }
    }

    case 'end-session': {
      if (!data.activeSessionId) return data
      const closed = withActive(data, (s) => ({ ...resume(s, action.ts), endedAt: action.ts }))
      return { ...closed, activeSessionId: null }
    }

    case 'toggle-pause': {
      if (!data.activeSessionId) return data
      return withActive(data, (s) =>
        isPaused(s) ? resume(s, action.ts) : { ...s, pauses: [...s.pauses, { from: action.ts, to: null }] },
      )
    }

    case 'rename-session': {
      const name = action.name.trim().slice(0, 80)
      if (!name) return data
      return {
        ...data,
        sessions: data.sessions.map((s) => (s.id === action.id ? { ...s, name } : s)),
      }
    }

    case 'delete-session':
      return {
        ...data,
        sessions: data.sessions.filter((s) => s.id !== action.id),
        activeSessionId: data.activeSessionId === action.id ? null : data.activeSessionId,
      }

    case 'restore-session': {
      const sessions = [...data.sessions, action.session].sort((a, b) => b.startedAt - a.startedAt)
      return {
        ...data,
        sessions,
        activeSessionId: action.makeActive ? action.session.id : data.activeSessionId,
      }
    }

    case 'delete-all-sessions':
      return { ...data, sessions: [], activeSessionId: null }

    case 'update-settings':
      return { ...data, settings: { ...data.settings, ...action.patch } }

    case 'update-desktop-settings':
      return {
        ...data,
        settings: { ...data.settings, desktop: { ...data.settings.desktop, ...action.patch } },
      }

    case 'update-treasure-settings':
      return {
        ...data,
        settings: { ...data.settings, treasure: { ...data.settings.treasure, ...action.patch } },
      }

    case 'update-treasure-cache':
      return { ...data, treasure: { ...data.treasure, ...action.patch } }

    case 'add-manual-window': {
      const manual = sortWindows([
        ...data.treasure.manual.filter((w) => w.id !== action.window.id),
        action.window,
      ])
      return { ...data, treasure: { ...data.treasure, manual } }
    }

    case 'remove-manual-window':
      return {
        ...data,
        treasure: {
          ...data.treasure,
          manual: data.treasure.manual.filter((w) => w.id !== action.id),
        },
      }

    case 'mark-notified':
      return {
        ...data,
        treasure: {
          ...data.treasure,
          notified: rememberNotified(data.treasure.notified, action.keys),
        },
      }

    case 'replace':
      return action.data

    case 'merge':
      return mergeData(data, action.data)

    default:
      return data
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export type CountOutcome = 'counted' | 'paused' | 'nothing-to-undo'

interface TrackerApi {
  data: AppData
  settings: Settings
  desktopSettings: DesktopSettings
  treasureSettings: TreasureSettings
  treasure: TreasureCache
  activeSession: Session | null
  count: number
  paused: boolean
  canUndo: boolean
  /** False until saved data has been read back; nothing is written before then. */
  hydrated: boolean
  storageStatus: StorageStatus
  storageBackend: Backend
  loadWarnings: string[]
  dismissLoadWarnings: () => void

  /** Returns what actually happened, so callers can give honest feedback. */
  addChest: () => CountOutcome
  adjust: (delta: number) => CountOutcome
  setCount: (value: number) => void
  undo: () => CountOutcome
  resetSession: () => void
  startSession: (name?: string) => void
  endSession: () => void
  togglePause: () => 'paused' | 'resumed' | 'no-session'
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => Session | null
  restoreSession: (session: Session, makeActive: boolean) => void
  deleteAllSessions: () => void
  updateSettings: (patch: Partial<Settings>) => void
  updateDesktopSettings: (patch: Partial<DesktopSettings>) => void
  updateTreasureSettings: (patch: Partial<TreasureSettings>) => void
  updateTreasureCache: (patch: Partial<TreasureCache>) => void
  addManualWindow: (window: TreasureWindow) => void
  removeManualWindow: (id: string) => void
  markNotified: (keys: string[]) => void
  replaceData: (data: AppData) => void
  mergeImport: (data: AppData) => void
  resetEverything: () => void
}

const TrackerContext = createContext<TrackerApi | null>(null)

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, emptyData())
  const [hydrated, setHydrated] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('ok')
  const [storageBackend, setStorageBackend] = useState<Backend>('browser')
  const [loadWarnings, setLoadWarnings] = useState<string[]>([])
  const dataRef = useRef(data)
  dataRef.current = data
  const hydratedRef = useRef(false)

  // Read saved data once. The desktop backend is asynchronous, so the UI
  // renders a short splash rather than flashing an empty dashboard.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await loadPersisted()
      if (cancelled) return
      dispatch({ type: 'hydrate', data: result.data })
      setStorageStatus(result.status)
      setStorageBackend(result.backend)
      setLoadWarnings(
        result.migratedFromBrowser
          ? [...result.warnings, 'Existing data from this app was moved into the desktop data file.']
          : result.warnings,
      )
      hydratedRef.current = true
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist on every change, debounced so rapid hotkey presses stay smooth.
  // Nothing is ever written before hydration, which would erase saved data.
  useEffect(() => {
    if (!hydrated || storageStatus === 'unavailable') return
    const timer = window.setTimeout(() => {
      void savePersisted(data).then((status) => {
        setStorageStatus((prev) => (prev === status ? prev : status))
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [data, hydrated, storageStatus])

  // A last write on the way out, in case the window closes inside the debounce.
  useEffect(() => {
    const flush = () => {
      if (hydratedRef.current && storageStatus !== 'unavailable') void savePersisted(dataRef.current)
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      flush()
    }
  }, [storageStatus])

  const activeSession = useMemo(
    () => data.sessions.find((s) => s.id === data.activeSessionId) ?? null,
    [data.sessions, data.activeSessionId],
  )

  const count = activeSession ? sessionCount(activeSession) : 0
  const paused = activeSession ? isPaused(activeSession) : false

  const deleteSession = useCallback<TrackerApi['deleteSession']>((id) => {
    const existing = dataRef.current.sessions.find((s) => s.id === id) ?? null
    if (existing) dispatch({ type: 'delete-session', id })
    return existing
  }, [])

  const resetEverything = useCallback(() => {
    void clearPersisted()
    dispatch({ type: 'replace', data: emptyData() })
  }, [])

  // Counting refuses to run while the session is paused, and says so instead
  // of silently dropping the press.
  const isCurrentlyPaused = useCallback(() => {
    const current = dataRef.current
    const active = current.sessions.find((s) => s.id === current.activeSessionId)
    return active ? isPaused(active) : false
  }, [])

  const addChest = useCallback<TrackerApi['addChest']>(() => {
    if (isCurrentlyPaused()) return 'paused'
    dispatch({ type: 'add-chest', ts: Date.now(), th: activeTreasureWindow() })
    return 'counted'
  }, [isCurrentlyPaused])

  const adjust = useCallback<TrackerApi['adjust']>(
    (delta) => {
      if (isCurrentlyPaused()) return 'paused'
      dispatch({ type: 'adjust', delta, ts: Date.now() })
      return 'counted'
    },
    [isCurrentlyPaused],
  )

  const undo = useCallback<TrackerApi['undo']>(() => {
    const current = dataRef.current
    const active = current.sessions.find((s) => s.id === current.activeSessionId)
    if (!active || active.events.length === 0) return 'nothing-to-undo'
    dispatch({ type: 'undo' })
    return 'counted'
  }, [])

  const togglePause = useCallback<TrackerApi['togglePause']>(() => {
    const current = dataRef.current
    const active = current.sessions.find((s) => s.id === current.activeSessionId)
    if (!active) return 'no-session'
    const wasPaused = isPaused(active)
    dispatch({ type: 'toggle-pause', ts: Date.now() })
    return wasPaused ? 'resumed' : 'paused'
  }, [])

  const api = useMemo<TrackerApi>(
    () => ({
      data,
      settings: data.settings,
      desktopSettings: data.settings.desktop,
      treasureSettings: data.settings.treasure,
      treasure: data.treasure,
      activeSession,
      count,
      paused,
      canUndo: (activeSession?.events.length ?? 0) > 0,
      hydrated,
      storageStatus,
      storageBackend,
      loadWarnings,
      dismissLoadWarnings: () => setLoadWarnings([]),

      addChest,
      adjust,
      setCount: (value) => dispatch({ type: 'set-count', value, ts: Date.now() }),
      undo,
      resetSession: () => dispatch({ type: 'reset-session' }),
      startSession: (name) => dispatch({ type: 'start-session', name, ts: Date.now() }),
      endSession: () => dispatch({ type: 'end-session', ts: Date.now() }),
      togglePause,
      renameSession: (id, name) => dispatch({ type: 'rename-session', id, name }),
      deleteSession,
      restoreSession: (session, makeActive) =>
        dispatch({ type: 'restore-session', session, makeActive }),
      deleteAllSessions: () => dispatch({ type: 'delete-all-sessions' }),
      updateSettings: (patch) => dispatch({ type: 'update-settings', patch }),
      updateDesktopSettings: (patch) => dispatch({ type: 'update-desktop-settings', patch }),
      updateTreasureSettings: (patch) => dispatch({ type: 'update-treasure-settings', patch }),
      updateTreasureCache: (patch) => dispatch({ type: 'update-treasure-cache', patch }),
      addManualWindow: (window) => dispatch({ type: 'add-manual-window', window }),
      removeManualWindow: (id) => dispatch({ type: 'remove-manual-window', id }),
      markNotified: (keys) => dispatch({ type: 'mark-notified', keys }),
      replaceData: (next) => dispatch({ type: 'replace', data: next }),
      mergeImport: (next) => dispatch({ type: 'merge', data: next }),
      resetEverything,
    }),
    [
      data,
      activeSession,
      count,
      paused,
      hydrated,
      storageStatus,
      storageBackend,
      loadWarnings,
      addChest,
      adjust,
      undo,
      togglePause,
      deleteSession,
      resetEverything,
    ],
  )

  return <TrackerContext.Provider value={api}>{children}</TrackerContext.Provider>
}

export function useTracker(): TrackerApi {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker must be used inside <TrackerProvider>')
  return ctx
}
