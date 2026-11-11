/** Local calendar day key, e.g. "2026-03-07". Never UTC, so "today" means
 *  today where the player actually is. */
export function dayKey(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function startOfDay(ts: number | Date): number {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts.getTime())
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

export function formatDecimal(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatWeekday(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })
}

/** "1h 24m" / "7m 12s" / "0s" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** "today", "yesterday" or the date. */
export function formatRelativeDay(ts: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const diffDays = Math.round((today - day) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
  return formatDate(ts)
}
