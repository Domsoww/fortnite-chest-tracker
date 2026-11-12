/** Everything about Treasure Hours is stored as an absolute instant (epoch
 *  milliseconds, parsed from UTC ISO strings) and only turned into wall-clock
 *  text at the moment it is displayed.
 *
 *  That is deliberate: no arithmetic in this file adds or subtracts hours, so
 *  a schedule can never drift when Central Europe switches between CET and
 *  CEST. `Intl` owns the conversion and already knows the rules. */

export const PRAGUE_TZ = 'Europe/Prague'

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour12: false,
})

const zoneFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  timeZoneName: 'short',
  hour12: false,
})

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRAGUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** "Sat 14 Nov, 20:00" in Prague time. */
export function pragueDateTime(ts: number): string {
  return dateTimeFmt.format(ts).replace(',', '').replace(/(\d{2}:\d{2})$/, '· $1')
}

/** "20:00" in Prague time. */
export function pragueTime(ts: number): string {
  return timeFmt.format(ts)
}

/** "Saturday 14 November" in Prague time. */
export function pragueDate(ts: number): string {
  return dateFmt.format(ts)
}

/** "CET" or "CEST", whichever applies at that instant. */
export function pragueZoneName(ts: number): string {
  const part = zoneFmt.formatToParts(ts).find((p) => p.type === 'timeZoneName')
  return part?.value ?? 'CET'
}

/** Calendar day in Prague, e.g. "2026-11-14". */
export function pragueDayKey(ts: number): string {
  return dayKeyFmt.format(ts)
}

/** "20:00–22:00 CET" for a window, collapsing a shared end-zone label. */
export function pragueRange(startsAt: number, endsAt: number): string {
  const from = pragueTime(startsAt)
  const to = pragueTime(endsAt)
  const zoneFrom = pragueZoneName(startsAt)
  const zoneTo = pragueZoneName(endsAt)
  // A window that straddles a clock change keeps both labels, rather than
  // quietly picking one and being an hour out for half of it.
  return zoneFrom === zoneTo ? `${from}–${to} ${zoneFrom}` : `${from} ${zoneFrom} – ${to} ${zoneTo}`
}

/** True when the viewer's own zone is not Prague, so both can be shown. */
export function viewerZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz !== PRAGUE_TZ ? tz : null
  } catch {
    return null
  }
}

/** Local wall-clock time in the viewer's own zone, for the second line. */
export function viewerTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** The viewer's own short zone label, e.g. "GMT+1". */
export function viewerZoneName(ts: number): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(ts)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

export interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

export function countdown(ms: number): Countdown {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.floor(clamped / 1000)
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs: clamped,
  }
}

/** "2d 04:31:09", "04:31:09" or "31:09" — always monospaced-friendly. */
export function formatCountdown(ms: number): string {
  const c = countdown(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  if (c.days > 0) return `${c.days}d ${p(c.hours)}:${p(c.minutes)}:${p(c.seconds)}`
  if (c.hours > 0) return `${p(c.hours)}:${p(c.minutes)}:${p(c.seconds)}`
  return `${p(c.minutes)}:${p(c.seconds)}`
}

/** "in 2 days", "in 3 hours", "in 12 minutes" — for notification text. */
export function formatLead(minutes: number): string {
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}

/* ------------------------------------------------------------------ */
/* Prague wall clock -> instant                                        */
/* ------------------------------------------------------------------ */

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** How far ahead of UTC Prague is at that instant, in milliseconds.
 *  +1h for CET, +2h for CEST — read from `Intl`, never hard-coded. */
export function pragueOffsetMs(ts: number): number {
  const parts = partsFmt.formatToParts(ts)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  // Hour 24 appears at midnight in some engines; normalise it to 0.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return asUtc - Math.floor(ts / 1000) * 1000
}

/** Turn a wall-clock date and time in Prague into an absolute instant.
 *
 *  The offset depends on the instant, and the instant depends on the offset,
 *  so this converges by applying the offset twice. The two days a year where
 *  the wall clock is not a function of the instant resolve deterministically:
 *  on the spring-forward day a time that never happens (02:30) lands on the
 *  following hour (03:30 CEST), and on the autumn day a time that happens
 *  twice (02:00) resolves to its second, standard-time occurrence. */
export function instantFromPrague(date: string, time: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m || !t) return null

  const [, y, mo, d] = m
  const hour = Number(t[1])
  const minute = Number(t[2])
  if (hour > 23 || minute > 59) return null

  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, 0)
  if (!Number.isFinite(naive)) return null

  let instant = naive - pragueOffsetMs(naive)
  instant = naive - pragueOffsetMs(instant)
  return instant
}

/** The "YYYY-MM-DD" and "HH:MM" an instant shows on a Prague clock, for
 *  pre-filling the manual-entry form. */
export function pragueFormValues(ts: number): { date: string; time: string } {
  return { date: pragueDayKey(ts), time: pragueTime(ts) }
}
