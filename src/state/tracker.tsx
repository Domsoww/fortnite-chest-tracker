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
import type { AppData, ChestEvent, Session, Settings } from '../types'
import { createId } from '../lib/id'
import { sessionCount } from '../lib/stats'
import {
  clearStoredData,
  emptyData,
  loadData,
  mergeData,
  saveData,
  type StorageStatus,
} from '../lib/storage'

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

type Action =
  | { type: 'add-chest'; ts: number }
  | { type: 'adjust'; delta: number; ts: number }
  | { type: 'set-count'; value: number; ts: number }
  | { type: 'undo' }
  | { type: 'reset-session' }
  | { type: 'start-session'; name?: string; ts: number }
  | { type: 'end-session'; ts: number }
  | { type: 'rename-session'; id: string; name: string }
  | { type: 'delete-session'; id: string }
  | { type: 'restore-session'; session: Session; makeActive: boolean }
  | { type: 'delete-all-sessions' }
  | { type: 'update-settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData }
  | { type: 'merge'; data: AppData }

function defaultSessionName(existing: Session[], ts: number): string {
  const sameDay = existing.filter(
    (s) => new Date(s.startedAt).toDateString() === new Date(ts).toDateString(),
  ).length
  return `Session ${sameDay + 1}`
}

function newSession(name: string, ts: number): Session {
  return { id: createId(), name, startedAt: ts, endedAt: null, events: [] }
}

function withActive(data: AppData, update: (s: Session) => Session): AppData {
  if (!data.activeSessionId) return data
  return {
    ...data,
    sessions: data.sessions.map((s) => (s.id === data.activeSessionId ? update(s) : s)),
  }
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
    case 'add-chest':
      return pushEvent(data, { id: createId(), ts: action.ts, delta: 1, kind: 'chest' })

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
        s.endedAt === null ? { ...s, endedAt: action.ts } : s,
      )
      return { ...data, sessions: [session, ...sessions], activeSessionId: session.id }
    }

    case 'end-session': {
      if (!data.activeSessionId) return data
      const closed = withActive(data, (s) => ({ ...s, endedAt: action.ts }))
      return { ...closed, activeSessionId: null }
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

interface TrackerApi {
  data: AppData
  settings: Settings
  activeSession: Session | null
  count: number
  canUndo: boolean
  storageStatus: StorageStatus
  loadWarnings: string[]
  dismissLoadWarnings: () => void

  addChest: () => void
  adjust: (delta: number) => void
  setCount: (value: number) => void
  undo: () => void
  resetSession: () => void
  startSession: (name?: string) => void
  endSession: () => void
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => Session | null
  restoreSession: (session: Session, makeActive: boolean) => void
  deleteAllSessions: () => void
  updateSettings: (patch: Partial<Settings>) => void
  replaceData: (data: AppData) => void
  mergeImport: (data: AppData) => void
  resetEverything: () => void
}

const TrackerContext = createContext<TrackerApi | null>(null)

const initial = loadData()

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, initial.data)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(initial.status)
  const [loadWarnings, setLoadWarnings] = useState<string[]>(initial.warnings)
  const dataRef = useRef(data)
  dataRef.current = data

  // Persist on every change. localStorage writes are synchronous, so this is
  // debounced to keep rapid +1 clicks smooth.
  useEffect(() => {
    if (storageStatus === 'unavailable') return
    const timer = window.setTimeout(() => {
      const status = saveData(data)
      setStorageStatus((prev) => (prev === status ? prev : status))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [data, storageStatus])

  // A last write on the way out, in case the tab closes inside the debounce.
  useEffect(() => {
    const flush = () => {
      if (storageStatus !== 'unavailable') saveData(dataRef.current)
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

  const deleteSession = useCallback<TrackerApi['deleteSession']>((id) => {
    const existing = dataRef.current.sessions.find((s) => s.id === id) ?? null
    if (existing) dispatch({ type: 'delete-session', id })
    return existing
  }, [])

  const resetEverything = useCallback(() => {
    clearStoredData()
    dispatch({ type: 'replace', data: emptyData() })
  }, [])

  const api = useMemo<TrackerApi>(
    () => ({
      data,
      settings: data.settings,
      activeSession,
      count,
      canUndo: (activeSession?.events.length ?? 0) > 0,
      storageStatus,
      loadWarnings,
      dismissLoadWarnings: () => setLoadWarnings([]),

      addChest: () => dispatch({ type: 'add-chest', ts: Date.now() }),
      adjust: (delta) => dispatch({ type: 'adjust', delta, ts: Date.now() }),
      setCount: (value) => dispatch({ type: 'set-count', value, ts: Date.now() }),
      undo: () => dispatch({ type: 'undo' }),
      resetSession: () => dispatch({ type: 'reset-session' }),
      startSession: (name) => dispatch({ type: 'start-session', name, ts: Date.now() }),
      endSession: () => dispatch({ type: 'end-session', ts: Date.now() }),
      renameSession: (id, name) => dispatch({ type: 'rename-session', id, name }),
      deleteSession,
      restoreSession: (session, makeActive) =>
        dispatch({ type: 'restore-session', session, makeActive }),
      deleteAllSessions: () => dispatch({ type: 'delete-all-sessions' }),
      updateSettings: (patch) => dispatch({ type: 'update-settings', patch }),
      replaceData: (next) => dispatch({ type: 'replace', data: next }),
      mergeImport: (next) => dispatch({ type: 'merge', data: next }),
      resetEverything,
    }),
    [data, activeSession, count, storageStatus, loadWarnings, deleteSession, resetEverything],
  )

  return <TrackerContext.Provider value={api}>{children}</TrackerContext.Provider>
}

export function useTracker(): TrackerApi {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker must be used inside <TrackerProvider>')
  return ctx
}
