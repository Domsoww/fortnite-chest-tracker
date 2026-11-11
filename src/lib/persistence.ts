import type { AppData } from '../types'
import { isDesktop } from '../desktop/platform'
import {
  clearLocalStorage,
  emptyData,
  parseStoredText,
  readLocalStorage,
  writeLocalStorage,
  type LoadResult,
  type StorageStatus,
} from './storage'

export type Backend = 'tauri' | 'browser'

export interface PersistenceLoad extends LoadResult {
  backend: Backend
  /** Set when desktop data was seeded from this webview's localStorage. */
  migratedFromBrowser: boolean
}

/* ------------------------------------------------------------------ */
/* Desktop: a JSON file owned by the Rust side                         */
/* ------------------------------------------------------------------ */

async function desktopInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

async function loadDesktop(): Promise<PersistenceLoad> {
  let raw: string | null = null
  try {
    raw = await desktopInvoke<string | null>('load_data')
  } catch (err) {
    return {
      data: emptyData(),
      status: 'unavailable',
      warnings: [`The data file could not be read: ${describe(err)}`],
      existed: false,
      backend: 'tauri',
      migratedFromBrowser: false,
    }
  }

  const parsed = parseStoredText(raw)
  if (parsed.existed) {
    return { ...parsed, status: 'ok', backend: 'tauri', migratedFromBrowser: false }
  }

  // First desktop run: an earlier desktop build may have written to the
  // webview's own localStorage. The user's *browser* data lives in a
  // different origin and can only arrive through Import JSON.
  const fromWebview = readLocalStorage()
  if (fromWebview.existed) {
    await saveDesktop(fromWebview.data)
    return {
      ...fromWebview,
      status: 'ok',
      backend: 'tauri',
      migratedFromBrowser: true,
    }
  }

  return { ...parsed, status: raw === null ? 'ok' : 'ok', backend: 'tauri', migratedFromBrowser: false }
}

async function saveDesktop(data: AppData): Promise<StorageStatus> {
  try {
    await desktopInvoke<void>('save_data', { contents: JSON.stringify(data) })
    return 'ok'
  } catch {
    return 'unavailable'
  }
}

function describe(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return 'unknown error'
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function loadPersisted(): Promise<PersistenceLoad> {
  if (isDesktop) return loadDesktop()
  return { ...readLocalStorage(), backend: 'browser', migratedFromBrowser: false }
}

export async function savePersisted(data: AppData): Promise<StorageStatus> {
  if (isDesktop) return saveDesktop(data)
  return writeLocalStorage(data)
}

export async function clearPersisted(): Promise<void> {
  if (isDesktop) {
    try {
      await desktopInvoke<void>('clear_data')
    } catch {
      /* the in-memory reset still happens */
    }
    return
  }
  clearLocalStorage()
}

/** Desktop only: write a backup file and return where it landed. */
export async function exportToFile(contents: string, fileName: string): Promise<string> {
  return desktopInvoke<string>('export_data', { contents, fileName })
}

/** Where the data currently lives, for display in Settings. */
export async function storageLocation(): Promise<string> {
  if (!isDesktop) return "this browser's local storage"
  try {
    return await desktopInvoke<string>('data_file_path')
  } catch {
    return 'the application data folder'
  }
}
