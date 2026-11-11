import { formatDate } from '../lib/format'
import type { DayBucket } from '../lib/stats'

/** Compact sparkline-style bars used on the dashboard. */
export function MiniBars({ data }: { data: DayBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.chests))
  return (
    <div className="flex h-16 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.key} className="group relative flex-1" title={`${formatDate(d.ts)}: ${d.chests}`}>
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${Math.max(4, (d.chests / max) * 64)}px`,
              background:
                d.chests > 0
                  ? 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent-2) 70%, transparent))'
                  : 'var(--border)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
