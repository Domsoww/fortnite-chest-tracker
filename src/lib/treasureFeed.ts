/** Getting the schedule from somewhere, with an honest answer about where.
 *
 *  There is no Epic Games API for Treasure Hours, so the app reads a small
 *  JSON file that this project publishes and that the user can point
 *  elsewhere. Three sources are tried in order and the result always says
 *  which one answered, so the UI can show a stale or offline state instead of
 *  pretending the schedule is current. */

import type { FeedOrigin, TreasureFeed } from '../types'
import { BUNDLED_FEED_PATH, parseFeed } from './treasure'

export interface FeedFetch {
  feed: TreasureFeed | null
  origin: FeedOrigin
  /** Epoch ms of this attempt. */
  fetchedAt: number
  /** Why the remote attempt failed, if it did. Null on a clean download. */
  error: string | null
  skipped: number
}

const TIMEOUT_MS = 8000

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // The schedule is public and tiny; no credentials ever leave the device.
      credentials: 'omit',
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'the request timed out'
  }
  if (err instanceof TypeError) {
    // The usual shape of an offline or CORS-blocked fetch.
    return 'no connection to the schedule'
  }
  if (err instanceof Error) return err.message
  return 'unknown error'
}

/** Try the remote feed, then the copy bundled with this build. */
export async function fetchFeed(url: string): Promise<FeedFetch> {
  const fetchedAt = Date.now()
  let error: string | null = null

  if (url.trim()) {
    try {
      const parsed = parseFeed(await fetchJson(url.trim()))
      if (parsed.ok && parsed.feed) {
        return { feed: parsed.feed, origin: 'remote', fetchedAt, error: null, skipped: parsed.skipped }
      }
      error = parsed.error ?? 'the downloaded schedule could not be read'
    } catch (err) {
      error = describe(err)
    }
  } else {
    error = 'no schedule address is set'
  }

  // Offline, or the address is broken. The bundled copy is always present and
  // is marked as such, so a stale schedule is never passed off as current.
  try {
    const parsed = parseFeed(await fetchJson(BUNDLED_FEED_PATH))
    if (parsed.ok && parsed.feed) {
      return { feed: parsed.feed, origin: 'bundled', fetchedAt, error, skipped: parsed.skipped }
    }
  } catch {
    /* fall through to reporting nothing at all */
  }

  return { feed: null, origin: 'none', fetchedAt, error, skipped: 0 }
}

/** Read a schedule the user picked from disk, for a private or offline list. */
export async function readFeedFile(file: File): Promise<{ feed?: TreasureFeed; error?: string }> {
  try {
    const parsed = parseFeed(JSON.parse(await file.text()))
    if (!parsed.ok || !parsed.feed) return { error: parsed.error ?? 'The file could not be read.' }
    return { feed: parsed.feed }
  } catch {
    return { error: 'That file is not valid JSON.' }
  }
}
