import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { formatDate, formatNumber, formatWeekday } from '../lib/format'
import type { DayBucket } from '../lib/stats'

const axisStyle = { fill: 'var(--text-faint)', fontSize: 11, fontWeight: 600 } as const

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="tabular mt-0.5 text-muted">
          <span className="font-semibold text-accent">{formatNumber(Number(entry.value ?? 0))}</span>{' '}
          {entry.name}
        </p>
      ))}
    </div>
  )
}

const cursorFill = 'color-mix(in srgb, var(--accent) 12%, transparent)'

/** Chests per day. Days with activity are highlighted, empty days stay quiet. */
export function DailyChestsChart({ data, height = 260 }: { data: DayBucket[]; height?: number }) {
  const rows = data.map((d) => ({
    ...d,
    label: data.length > 10 ? formatDate(d.ts).replace(/,.*$/, '') : formatWeekday(d.ts),
    full: formatDate(d.ts),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: cursorFill }}
          labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''}
        />
        <Bar dataKey="chests" name="chests" radius={[6, 6, 2, 2]} maxBarSize={46}>
          {rows.map((row) => (
            <Cell key={row.key} fill={row.chests > 0 ? 'url(#bar-grad)' : 'var(--border)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Running all-time total, which makes progress obvious even on quiet days. */
export function CumulativeChart({
  data,
  height = 260,
}: {
  data: (DayBucket & { total: number })[]
  height?: number
}) {
  const rows = data.map((d) => ({ ...d, label: formatDate(d.ts).replace(/,.*$/, ''), full: formatDate(d.ts) }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.55} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip
          content={<ChartTooltip />}
          labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''}
        />
        <Area
          type="monotone"
          dataKey="total"
          name="chests in total"
          stroke="var(--accent)"
          strokeWidth={2.5}
          fill="url(#area-grad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** When during the day the player actually loots. */
export function HourChart({
  data,
  height = 220,
}: {
  data: { hour: number; chests: number }[]
  height?: number
}) {
  const rows = data.map((d) => ({
    ...d,
    label: `${String(d.hour).padStart(2, '0')}:00`,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          interval={2}
        />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: cursorFill }} />
        <Bar dataKey="chests" name="chests" radius={[5, 5, 2, 2]} maxBarSize={28}>
          {rows.map((row) => (
            <Cell key={row.hour} fill={row.chests > 0 ? 'var(--gold)' : 'var(--border)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
