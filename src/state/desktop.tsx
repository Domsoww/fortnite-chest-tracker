import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { HotkeyAction } from '../types'
import { isDesktop } from '../desktop/platform'
import {
  applyShortcuts,
  getAutostart,
  onHotkey,
  onTrayCommand,
  setAutostart,
  setCloseToTray,
  toRequests,
  updateTray,
  type ShortcutResult,
  type TrayCommand,
} from '../desktop/bridge'
import { hotkeyLabels } from '../lib/storage'
import { playBlockedSound, playChestSound, primeSounds, playSound } from '../lib/sound'
import { useTracker } from './tracker'
import { useToast } from './toast'

interface DesktopApi {
  /** True only inside the Tauri shell. */
  available: boolean
  /** Per-shortcut outcome of the last registration attempt. */
  results: ShortcutResult[]
  /** True while a registration round-trip is in flight. */
  applying: boolean
  /** Ask the OS again, e.g. after another app released a combination. */
  reapply: () => Promise<void>
  /** Does the OS report the app as launching at sign-in? */
  autostartActive: boolean
  setAutostartEnabled: (enabled: boolean) => Promise<void>
  /** Plays the bundled confirmation sound at the current volume. */
  testSound: () => void
}

const DesktopContext = createContext<DesktopApi | null>(null)

export function DesktopProvider({ children }: { children: ReactNode }) {
  const tracker = useTracker()
  const { push } = useToast()
  const [results, setResults] = useState<ShortcutResult[]>([])
  const [applying, setApplying] = useState(false)
  const [autostartActive, setAutostartActive] = useState(false)

  const { hydrated, settings, desktopSettings, activeSession, count, paused } = tracker
  const { sound } = settings
  const { globalShortcuts, hotkeys, soundVolume, minimizeToTray, startWithWindows } = desktopSettings

  // Keep a live reference so the event listeners never close over stale state.
  const stateRef = useRef({ tracker, sound, soundVolume, push })
  stateRef.current = { tracker, sound, soundVolume, push }

  useEffect(() => {
    if (isDesktop) primeSounds()
  }, [])

  /* ---------------- shortcut registration ---------------- */

  const apply = useCallback(async () => {
    if (!isDesktop) return
    setApplying(true)
    try {
      const outcome = await applyShortcuts(toRequests(hotkeys, globalShortcuts))
      setResults(outcome)
      const failed = outcome.filter((r) => !r.registered && r.error)
      if (failed.length > 0) {
        const first = failed[0]
        stateRef.current.push(
          `${hotkeyLabels[first.action]} could not use ${first.accelerator}: ${first.error}`,
          'danger',
        )
      }
    } catch (err) {
      stateRef.current.push(
        `Global shortcuts could not be registered: ${err instanceof Error ? err.message : String(err)}`,
        'danger',
      )
      setResults([])
    } finally {
      setApplying(false)
    }
  }, [hotkeys, globalShortcuts])

  useEffect(() => {
    if (!isDesktop || !hydrated) return
    void apply()
  }, [apply, hydrated])

  /* ---------------- hotkey and tray events ---------------- */

  const runAction = useCallback((action: HotkeyAction) => {
    const { tracker: t, sound: soundOn, soundVolume: volume, push: notify } = stateRef.current
    switch (action) {
      case 'add': {
        const outcome = t.addChest()
        if (outcome === 'counted') {
          if (soundOn) playChestSound(volume)
        } else if (outcome === 'paused') {
          if (soundOn) playBlockedSound(volume)
          notify('Session is paused — resume it to keep counting.', 'warning')
        }
        break
      }
      case 'remove': {
        const outcome = t.adjust(-1)
        if (outcome === 'counted' && soundOn) playSound('chest', volume * 0.7)
        else if (outcome === 'paused') {
          if (soundOn) playBlockedSound(volume)
          notify('Session is paused — resume it to keep counting.', 'warning')
        }
        break
      }
      case 'undo': {
        const outcome = t.undo()
        if (outcome === 'nothing-to-undo') notify('Nothing left to undo in this session.', 'info')
        else if (soundOn) playSound('chest', volume * 0.55)
        break
      }
      case 'togglePause': {
        const outcome = t.togglePause()
        if (outcome === 'no-session') notify('No session is running.', 'info')
        else notify(outcome === 'paused' ? 'Session paused.' : 'Session resumed.', 'info')
        if (soundOn) playSound(outcome === 'paused' ? 'blocked' : 'chest', volume * 0.7)
        break
      }
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void onHotkey((action) => runAction(action)).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [runAction])

  const runTrayCommand = useCallback((command: TrayCommand) => {
    const { tracker: t, push: notify } = stateRef.current
    switch (command) {
      case 'start-session':
        t.startSession()
        notify('Session started.', 'success')
        break
      case 'toggle-pause': {
        const outcome = t.togglePause()
        notify(
          outcome === 'no-session'
            ? 'No session is running.'
            : outcome === 'paused'
              ? 'Session paused.'
              : 'Session resumed.',
          'info',
        )
        break
      }
      case 'end-session':
        t.endSession()
        notify('Session finished and saved.', 'success')
        break
      case 'toggle-shortcuts':
        t.updateDesktopSettings({ globalShortcuts: !t.desktopSettings.globalShortcuts })
        break
      case 'open':
      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void onTrayCommand((command) => runTrayCommand(command)).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [runTrayCommand])

  /* ---------------- tray + window preferences ---------------- */

  useEffect(() => {
    if (!isDesktop || !hydrated) return
    void updateTray({
      sessionName: activeSession?.name ?? null,
      count,
      running: activeSession !== null,
      paused,
      shortcutsEnabled: globalShortcuts,
    })
  }, [hydrated, activeSession, count, paused, globalShortcuts])

  useEffect(() => {
    if (!isDesktop || !hydrated) return
    void setCloseToTray(minimizeToTray)
  }, [hydrated, minimizeToTray])

  // Reflect what the OS actually reports rather than what was last clicked.
  useEffect(() => {
    if (!isDesktop || !hydrated) return
    void getAutostart().then(setAutostartActive)
  }, [hydrated])

  const setAutostartEnabled = useCallback(
    async (enabled: boolean) => {
      const actual = await setAutostart(enabled).catch(() => !enabled)
      setAutostartActive(actual)
      stateRef.current.tracker.updateDesktopSettings({ startWithWindows: actual })
      if (actual !== enabled) {
        stateRef.current.push('Windows refused the start-up change.', 'danger')
      }
    },
    [],
  )

  // If the stored preference and the OS disagree on startup, trust the OS.
  useEffect(() => {
    if (!isDesktop || !hydrated) return
    if (startWithWindows !== autostartActive) {
      void setAutostart(startWithWindows)
        .then(setAutostartActive)
        .catch(() => undefined)
    }
    // Only reconciles once per autostart reading, not on every settings edit.
  }, [hydrated, autostartActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const testSound = useCallback(() => {
    playChestSound(stateRef.current.soundVolume)
  }, [])

  const value = useMemo<DesktopApi>(
    () => ({
      available: isDesktop,
      results,
      applying,
      reapply: apply,
      autostartActive,
      setAutostartEnabled,
      testSound,
    }),
    [results, applying, apply, autostartActive, setAutostartEnabled, testSound],
  )

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>
}

export function useDesktop(): DesktopApi {
  const ctx = useContext(DesktopContext)
  if (!ctx) throw new Error('useDesktop must be used inside <DesktopProvider>')
  return ctx
}
