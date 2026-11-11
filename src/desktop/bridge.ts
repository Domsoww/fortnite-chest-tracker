import type { HotkeyAction, HotkeyMap } from '../types'
import { isDesktop } from './platform'

/** One shortcut as the Rust side expects it. */
export interface ShortcutRequest {
  action: HotkeyAction
  accelerator: string
  enabled: boolean
}

/** What actually happened when the OS was asked to take the shortcut. */
export interface ShortcutResult {
  action: HotkeyAction
  accelerator: string
  registered: boolean
  /** Human-readable reason when `registered` is false. */
  error: string | null
}

export interface TrayInfo {
  sessionName: string | null
  count: number
  running: boolean
  paused: boolean
  shortcutsEnabled: boolean
}

export type TrayCommand =
  | 'open'
  | 'start-session'
  | 'toggle-pause'
  | 'toggle-shortcuts'
  | 'end-session'

async function core() {
  return import('@tauri-apps/api/core')
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await core()
  return invoke<T>(command, args)
}

export function toRequests(map: HotkeyMap, globallyEnabled: boolean): ShortcutRequest[] {
  return (Object.keys(map) as HotkeyAction[]).map((action) => ({
    action,
    accelerator: map[action].accelerator,
    enabled: globallyEnabled && map[action].enabled,
  }))
}

/** Replace every registered shortcut in one atomic call. Returns the real
 *  outcome per shortcut; the UI must never claim success on its own. */
export async function applyShortcuts(bindings: ShortcutRequest[]): Promise<ShortcutResult[]> {
  if (!isDesktop) return []
  return call<ShortcutResult[]>('apply_shortcuts', { bindings })
}

export async function updateTray(info: TrayInfo): Promise<void> {
  if (!isDesktop) return
  await call<void>('update_tray', { info })
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (!isDesktop) return
  await call<void>('set_close_to_tray', { enabled })
}

export async function setAutostart(enabled: boolean): Promise<boolean> {
  if (!isDesktop) return false
  return call<boolean>('set_autostart', { enabled })
}

export async function getAutostart(): Promise<boolean> {
  if (!isDesktop) return false
  try {
    return await call<boolean>('get_autostart')
  } catch {
    return false
  }
}

export async function showMainWindow(): Promise<void> {
  if (!isDesktop) return
  await call<void>('show_window')
}

export async function quitApp(): Promise<void> {
  if (!isDesktop) return
  await call<void>('quit_app')
}

export async function appVersion(): Promise<string> {
  if (!isDesktop) return ''
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return ''
  }
}

type Unlisten = () => void

/** Global shortcut presses arrive here, whatever window has focus. */
export async function onHotkey(handler: (action: HotkeyAction) => void): Promise<Unlisten> {
  if (!isDesktop) return () => undefined
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ action: HotkeyAction }>('chest-hotkey', (event) => handler(event.payload.action))
}

/** Clicks in the tray menu. */
export async function onTrayCommand(handler: (command: TrayCommand) => void): Promise<Unlisten> {
  if (!isDesktop) return () => undefined
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ command: TrayCommand }>('tray-command', (event) => handler(event.payload.command))
}

/* ------------------------------------------------------------------ */
/* Accelerator helpers                                                 */
/* ------------------------------------------------------------------ */

const modifierOrder = ['CommandOrControl', 'Control', 'Alt', 'Shift', 'Super']

/** Turn a keyboard event into a Tauri accelerator, or null if it is not a
 *  usable combination (a bare key, or modifiers only). */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null

  let main: string
  if (/^[a-z]$/i.test(key)) main = key.toUpperCase()
  else if (/^[0-9]$/.test(key)) main = key
  else if (e.code.startsWith('Digit')) main = e.code.slice(5)
  else if (e.code.startsWith('Key')) main = e.code.slice(3)
  else if (/^F\d{1,2}$/.test(key)) main = key
  else if (key === ' ') main = 'Space'
  else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) main = key.slice(5)
  else if (['Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Tab'].includes(key)) main = key
  else if (/^[-=\[\]\;',./`]$/.test(key)) main = key
  else return null

  return [...parts, main].join('+')
}

/** How the combination should read on screen, Windows-style. */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return 'Ctrl'
      if (part === 'Control') return 'Ctrl'
      if (part === 'Super') return 'Win'
      return part
    })
    .join(' + ')
}

export function sortModifiers(accelerator: string): string {
  const parts = accelerator.split('+')
  const main = parts[parts.length - 1]
  const mods = parts.slice(0, -1).sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b))
  return [...mods, main].join('+')
}
