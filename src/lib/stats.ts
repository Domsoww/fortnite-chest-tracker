import type { Session } from '../types'
import { addDays, dayKey, startOfDay } from './format'

export function sessionCount(s: Session): number {
  let total = 0
  for (const e of s.events) total += e.delta
  return Math.max(0, total)
}

/** True while the session is in an open pause span. */
export function isPaused(s: Session): boolean {
  return s.endedAt === null && s.pauses.some((p) => p.to === null)
}

/** Total time the session spent paused, including a pause still open. */
export function pausedMs(s: Session, now = Date.now()): number {
  const end = s.endedAt ?? now
  let total = 0
  for (const span of s.pauses) {
    const to = span.to ?? end
    total += Math.max(0, Math.min(to, end) - span.from)
  }
  return total
}

/** Wall-clock length minus any paused stretches. */
export function sessionDuration(s: Session, now = Date.now()): number {
  const gross = Math.max(0, (s.endedAt ?? now) - s.startedAt)
  return Math.max(0, gross - pausedMs(s, now))
}

/** Chests per hour, or null when the session is too short to be meaningful. */
export function sessionRate(s: Session, now = Date.now()): number | null {
  const ms = sessionDuration(s, now)
  if (ms < 60_000) return null
  return (sessionCount(s) / ms) * 3_600_000
}

export interface DayBucket {
  key: string
  /** Start of that local day, epoch ms. */
  ts: number
  chests: number
  sessions: number
}

/** Chests grouped by the local day they were actually opened on. */
export function chestsByDay(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    for (const e of s.events) {
      const k = dayKey(e.ts)
      map.set(k, (map.get(k) ?? 0) + e.delta)
    }
  }
  for (const [k, v] of map) if (v < 0) map.set(k, 0)
  return map
}

export function sessionsByDay(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const k = dayKey(s.startedAt)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

/** A continuous run of days ending today, suitable for a bar chart. */
export function dayRange(sessions: Session[], days: number, now = Date.now()): DayBucket[] {
  const chests = chestsByDay(sessions)
  const starts = sessionsByDay(sessions)
  const today = startOfDay(now)
  const out: DayBucket[] = []
  for (let i = days - 1; i >= 0; i--) {
    const ts = addDays(today, -i)
    const key = dayKey(ts)
    out.push({ key, ts, chests: chests.get(key) ?? 0, sessions: starts.get(key) ?? 0 })
  }
  return out
}

export interface Streaks {
  current: number
  longest: number
}

/** Consecutive days with at least one chest. */
export function streaks(sessions: Session[], now = Date.now()): Streaks {
  const chests = chestsByDay(sessions)
  const activeDays = new Set(
    Array.from(chests.entries())
      .filter(([, v]) => v > 0)
      .map(([k]) => k),
  )
  if (activeDays.size === 0) return { current: 0, longest: 0 }

  const today = startOfDay(now)

  let current = 0
  // A streak is still alive if the player played today or yesterday.
  let cursor = activeDays.has(dayKey(today)) ? today : addDays(today, -1)
  if (activeDays.has(dayKey(cursor))) {
    while (activeDays.has(dayKey(cursor))) {
      current++
      cursor = addDays(cursor, -1)
    }
  }

  const sorted = Array.from(activeDays).sort()
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`).getTime()
    const curr = new Date(`${sorted[i]}T00:00:00`).getTime()
    const gapDays = Math.round((curr - prev) / 86_400_000)
    run = gapDays === 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  return { current, longest }
}

export interface Records {
  bestSession: { session: Session; count: number } | null
  bestDay: { key: string; ts: number; chests: number } | null
  bestRate: { session: Session; rate: number } | null
  longestSession: { session: Session; ms: number } | null
}

export function records(sessions: Session[]): Records {
  let bestSession: Records['bestSession'] = null
  let bestRate: Records['bestRate'] = null
  let longestSession: Records['longestSession'] = null

  for (const s of sessions) {
    if (s.endedAt === null) continue // only finished sessions count as records
    const count = sessionCount(s)
    if (count > 0 && (!bestSession || count > bestSession.count)) bestSession = { session: s, count }

    const rate = sessionRate(s)
    if (rate !== null && count > 0 && (!bestRate || rate > bestRate.rate)) bestRate = { session: s, rate }

    const ms = sessionDuration(s)
    if (ms > 0 && (!longestSession || ms > longestSession.ms)) longestSession = { session: s, ms }
  }

  let bestDay: Records['bestDay'] = null
  for (const [key, chests] of chestsByDay(sessions)) {
    if (chests > 0 && (!bestDay || chests > bestDay.chests)) {
      bestDay = { key, chests, ts: new Date(`${key}T00:00:00`).getTime() }
    }
  }

  return { bestSession, bestDay, bestRate, longestSession }
}

export interface Totals {
  chests: number
  sessions: number
  finishedSessions: number
  today: number
  yesterday: number
  last7: number
  last30: number
  activeDays: number
  averagePerSession: number
  averagePerActiveDay: number
  playtimeMs: number
  firstActivity: number | null
}

export function totals(sessions: Session[], now = Date.now()): Totals {
  const byDay = chestsByDay(sessions)
  const chests = sessions.reduce((sum, s) => sum + sessionCount(s), 0)
  const finished = sessions.filter((s) => s.endedAt !== null)
  const today = startOfDay(now)

  const sumSince = (days: number) => {
    let sum = 0
    for (let i = 0; i < days; i++) sum += byDay.get(dayKey(addDays(today, -i))) ?? 0
    return sum
  }

  const activeDays = Array.from(byDay.values()).filter((v) => v > 0).length
  const countedSessions = sessions.filter((s) => sessionCount(s) > 0).length
  const playtimeMs = sessions.reduce((sum, s) => sum + sessionDuration(s, now), 0)
  const firstActivity = sessions.length
    ? Math.min(...sessions.map((s) => s.startedAt))
    : null

  return {
    chests,
    sessions: sessions.length,
    finishedSessions: finished.length,
    today: byDay.get(dayKey(today)) ?? 0,
    yesterday: byDay.get(dayKey(addDays(today, -1))) ?? 0,
    last7: sumSince(7),
    last30: sumSince(30),
    activeDays,
    averagePerSession: countedSessions ? chests / countedSessions : 0,
    averagePerActiveDay: activeDays ? chests / activeDays : 0,
    playtimeMs,
    firstActivity,
  }
}

/** Chests per hour of the day, 0–23. Shows when the player actually loots. */
export function hourHistogram(sessions: Session[]): { hour: number; chests: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, chests: 0 }))
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.delta <= 0) continue
      buckets[new Date(e.ts).getHours()].chests += e.delta
    }
  }
  return buckets
}

/** Cumulative chest total over the last N days. */
export function cumulativeByDay(sessions: Session[], days: number, now = Date.now()) {
  const range = dayRange(sessions, days, now)
  const before = (() => {
    const firstTs = range[0]?.ts ?? startOfDay(now)
    let sum = 0
    for (const s of sessions) for (const e of s.events) if (e.ts < firstTs) sum += e.delta
    return Math.max(0, sum)
  })()

  let running = before
  return range.map((d) => {
    running += d.chests
    return { ...d, total: running }
  })
}
