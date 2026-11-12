import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { TreasureWindow } from '../types'
import { allWindows, dueReminders, reminderText, treasureState } from '../lib/treasure'
import type { TreasureState } from '../lib/treasure'
import { fetchFeed } from '../lib/treasureFeed'
import { setActiveTreasureWindow } from '../lib/treasureNow'
import { notifyPermission, requestNotifyPermission, sendNotification } from '../lib/notify'
import type { NotifyPermission } from '../lib/notify'
import { playSound } from '../lib/sound'
import { useTracker } from './tracker'
import { useToast } from './toast'

interface TreasureApi {
  /** Every known window: the feed's plus the user's own. */
  windows: TreasureWindow[]
  /** Which window is live, what is next, and how long until each. */
  state: TreasureState
  /** Ticks every second while a countdown is on screen. */
  now: number
  /** True while the schedule is being downloaded. */
  refreshing: boolean
  refresh: () => Promise<void>
  /** OS notification permission, as the OS reports it. */
  permission: NotifyPermission
  askPermission: () => Promise<void>
  /** Shows a sample reminder so the user can see where it appears. */
  testNotification: () => Promise<void>
}

const TreasureContext = createContext<TreasureApi | null>(null)

/** Countdowns need a second-by-second clock; everything else derives from it.
 *  The interval stops while the window is hidden, so the desktop build stays
 *  close to idle in the tray. */
function useClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let timer = 0
    const start = () => {
      window.clearInterval(timer)
      setNow(Date.now())
      // Hidden windows still need to fire reminders, just not 60 times a minute.
      timer = window.setInterval(() => setNow(Date.now()), document.hidden ? 20_000 : 1000)
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', start)
    }
  }, [enabled])
  return now
}

export function TreasureProvider({ children }: { children: ReactNode }) {
  const tracker = useTracker()
  const { push } = useToast()
  const {
    hydrated,
    treasure,
    treasureSettings,
    settings,
    updateTreasureCache,
    markNotified,
  } = tracker

  const [refreshing, setRefreshing] = useState(false)
  const [permission, setPermission] = useState<NotifyPermission>('default')
  const now = useClock(treasureSettings.enabled)

  const windows = useMemo(
    () => allWindows(treasure, treasureSettings),
    [treasure, treasureSettings],
  )
  const state = useMemo(() => treasureState(windows, now), [windows, now])

  // Keep a live reference so the reminder effect never closes over stale state.
  const liveRef = useRef({ tracker, push, settings })
  liveRef.current = { tracker, push, settings }

  /* ---------------- fetching the schedule ---------------- */

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await fetchFeed(treasureSettings.feedUrl)
      updateTreasureCache({
        // A failed download keeps whatever schedule is already cached.
        feed: result.feed ?? liveRef.current.tracker.treasure.feed,
        origin: result.feed ? result.origin : liveRef.current.tracker.treasure.origin,
        fetchedAt: result.fetchedAt,
        lastError: result.error,
      })
    } finally {
      setRefreshing(false)
    }
  }, [treasureSettings.feedUrl, updateTreasureCache])

  // One fetch once saved data is in, then on the chosen interval.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!hydrated || !treasureSettings.enabled) return
    void refreshRef.current()
  }, [hydrated, treasureSettings.enabled, treasureSettings.feedUrl])

  useEffect(() => {
    if (!hydrated || !treasureSettings.enabled || !treasureSettings.autoRefresh) return
    const period = Math.max(5, treasureSettings.refreshMinutes) * 60_000
    const timer = window.setInterval(() => void refreshRef.current(), period)
    return () => window.clearInterval(timer)
  }, [hydrated, treasureSettings.enabled, treasureSettings.autoRefresh, treasureSettings.refreshMinutes])

  /* ---------------- the live window ---------------- */

  // Chests counted from now on carry this window's id.
  useEffect(() => {
    setActiveTreasureWindow(state.current?.id ?? null)
  }, [state.current])

  /* ---------------- reminders ---------------- */

  useEffect(() => {
    void notifyPermission().then(setPermission)
  }, [])

  useEffect(() => {
    if (!hydrated || !treasureSettings.enabled) return
    const due = dueReminders(windows, treasureSettings, treasure.notified, now)
    if (due.length === 0) return

    // Recorded first: if anything below throws, the reminder is still spent
    // rather than firing again on the next tick.
    markNotified(due.map((r) => r.key))

    for (const reminder of due) {
      const { title, body } = reminderText(reminder)
      void sendNotification(title, body).then((delivered) => {
        // The in-app toast is the fallback, not a duplicate.
        if (!delivered) liveRef.current.push(`${title} — ${body}`, 'warning')
      })
      if (treasureSettings.sound && liveRef.current.settings.sound) {
        playSound('chest', liveRef.current.settings.desktop.soundVolume)
      }
    }
  }, [hydrated, now, windows, treasureSettings, treasure.notified, markNotified])

  const askPermission = useCallback(async () => {
    const result = await requestNotifyPermission()
    setPermission(result)
    if (result === 'denied') {
      push('Notifications are blocked, so reminders will appear in the app only.', 'warning')
    } else if (result === 'unsupported') {
      push('This build cannot show system notifications; reminders stay in the app.', 'info')
    }
  }, [push])

  const testNotification = useCallback(async () => {
    const delivered = await sendNotification(
      'Treasure Hours reminder',
      'This is what a reminder looks like.',
    )
    if (!delivered) push('Treasure Hours reminder — this is what a reminder looks like.', 'info')
    if (treasureSettings.sound && settings.sound) playSound('chest', settings.desktop.soundVolume)
  }, [push, treasureSettings.sound, settings.sound, settings.desktop.soundVolume])

  const value = useMemo<TreasureApi>(
    () => ({
      windows,
      state,
      now,
      refreshing,
      refresh,
      permission,
      askPermission,
      testNotification,
    }),
    [windows, state, now, refreshing, refresh, permission, askPermission, testNotification],
  )

  return <TreasureContext.Provider value={value}>{children}</TreasureContext.Provider>
}

export function useTreasure(): TreasureApi {
  const ctx = useContext(TreasureContext)
  if (!ctx) throw new Error('useTreasure must be used inside <TreasureProvider>')
  return ctx
}
