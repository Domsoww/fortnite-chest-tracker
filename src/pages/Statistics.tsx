import { useState } from 'react'
import {
  Award,
  BarChart3,
  CalendarDays,
  Clock4,
  Flame,
  Gauge,
  Hourglass,
  Layers,
  Package,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { Card, CardHeader } from '../components/Card'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { CumulativeChart, DailyChestsChart, HourChart } from '../components/charts'
import { useTracker } from '../state/tracker'
import {
  cumulativeByDay,
  dayRange,
  hourHistogram,
  records,
  sessionCount,
  streaks,
  totals,
} from '../lib/stats'
import {
  formatDate,
  formatDecimal,
  formatDuration,
  formatNumber,
  formatRelativeDay,
} from '../lib/format'

const ranges = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

export function Statistics() {
  const { data } = useTracker()
  const [days, setDays] = useState<number>(14)
  const sessions = data.sessions

  if (sessions.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Statistics" title="Performance" />
        <Card>
          <EmptyState
            icon={<BarChart3 size={24} />}
            title="No data to chart yet"
            description="Statistics appear as soon as you register your first chest on the dashboard."
          />
        </Card>
      </>
    )
  }

  const t = totals(sessions)
  const rec = records(sessions)
  const streak = streaks(sessions)
  const range = dayRange(sessions, days)
  const cumulative = cumulativeByDay(sessions, days)
  const hours = hourHistogram(sessions)
  const peakHour = hours.reduce((best, h) => (h.chests > best.chests ? h : best), hours[0])
  const bestDayInRange = range.reduce((best, d) => (d.chests > best.chests ? d : best), range[0])
  const rangeTotal = range.reduce((sum, d) => sum + d.chests, 0)
  const activeInRange = range.filter((d) => d.chests > 0).length

  return (
    <>
      <PageHeader
        eyebrow="Statistics"
        title="Performance"
        description="Everything below is calculated from the sessions stored on this device."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total chests"
          value={formatNumber(t.chests)}
          hint="all time"
          icon={<Package size={16} />}
          tone="accent"
        />
        <StatCard
          label="Total sessions"
          value={formatNumber(t.sessions)}
          hint={`${formatNumber(t.finishedSessions)} finished`}
          icon={<Layers size={16} />}
        />
        <StatCard
          label="Avg. per session"
          value={formatDecimal(t.averagePerSession)}
          hint="counting sessions with chests"
          icon={<Gauge size={16} />}
        />
        <StatCard
          label="Avg. per active day"
          value={formatDecimal(t.averagePerActiveDay)}
          hint={`${formatNumber(t.activeDays)} active ${t.activeDays === 1 ? 'day' : 'days'}`}
          icon={<CalendarDays size={16} />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today" value={formatNumber(t.today)} hint="chests" icon={<TrendingUp size={16} />} />
        <StatCard label="Last 7 days" value={formatNumber(t.last7)} hint="chests" icon={<TrendingUp size={16} />} />
        <StatCard label="Last 30 days" value={formatNumber(t.last30)} hint="chests" icon={<TrendingUp size={16} />} />
        <StatCard
          label="Tracked playtime"
          value={formatDuration(t.playtimeMs)}
          hint={t.firstActivity ? `since ${formatDate(t.firstActivity)}` : undefined}
          icon={<Hourglass size={16} />}
        />
      </div>

      {/* Activity over time */}
      <Card className="mt-5">
        <CardHeader
          title="Chests per day"
          subtitle={`${formatNumber(rangeTotal)} chests over ${days} days · ${formatNumber(
            activeInRange,
          )} active ${activeInRange === 1 ? 'day' : 'days'}`}
          icon={<BarChart3 size={18} />}
          action={
            <div className="flex flex-wrap gap-1">
              {ranges.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    days === r.days
                      ? 'border border-line-strong bg-surface-3 text-ink'
                      : 'border border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-2 pb-4 pt-5 sm:px-4">
          <DailyChestsChart data={range} />
        </div>
        {bestDayInRange.chests > 0 ? (
          <p className="px-5 pb-5 text-xs text-faint sm:px-6">
            Best day in this range: {formatDate(bestDayInRange.ts)} with{' '}
            {formatNumber(bestDayInRange.chests)} chests.
          </p>
        ) : null}
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Cumulative total"
            subtitle="How your all-time count has grown"
            icon={<TrendingUp size={18} />}
          />
          <div className="px-2 pb-5 pt-5 sm:px-4">
            <CumulativeChart data={cumulative} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Looting by hour"
            subtitle={
              peakHour.chests > 0
                ? `You open the most chests around ${String(peakHour.hour).padStart(2, '0')}:00`
                : 'When you open chests during the day'
            }
            icon={<Clock4 size={18} />}
          />
          <div className="px-2 pb-5 pt-5 sm:px-4">
            <HourChart data={hours} />
          </div>
        </Card>
      </div>

      {/* Records */}
      <Card className="mt-5">
        <CardHeader title="Personal records" subtitle="Your best results so far" icon={<Trophy size={18} />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <RecordRow
            icon={<Award size={16} />}
            label="Best session"
            value={rec.bestSession ? `${formatNumber(rec.bestSession.count)} chests` : '—'}
            detail={
              rec.bestSession
                ? `${rec.bestSession.session.name} · ${formatRelativeDay(rec.bestSession.session.startedAt)}`
                : 'Finish a session to set this record'
            }
          />
          <RecordRow
            icon={<CalendarDays size={16} />}
            label="Best day"
            value={rec.bestDay ? `${formatNumber(rec.bestDay.chests)} chests` : '—'}
            detail={rec.bestDay ? formatDate(rec.bestDay.ts) : 'No chests recorded yet'}
          />
          <RecordRow
            icon={<Timer size={16} />}
            label="Fastest looting"
            value={rec.bestRate ? `${Math.round(rec.bestRate.rate)} chests/h` : '—'}
            detail={
              rec.bestRate
                ? `${rec.bestRate.session.name} · ${formatRelativeDay(rec.bestRate.session.startedAt)}`
                : 'Needs a finished session of at least a minute'
            }
          />
          <RecordRow
            icon={<Hourglass size={16} />}
            label="Longest session"
            value={rec.longestSession ? formatDuration(rec.longestSession.ms) : '—'}
            detail={
              rec.longestSession
                ? `${rec.longestSession.session.name} · ${formatNumber(
                    sessionCount(rec.longestSession.session),
                  )} chests`
                : 'Finish a session to set this record'
            }
          />
          <RecordRow
            icon={<Flame size={16} />}
            label="Current streak"
            value={`${formatNumber(streak.current)} ${streak.current === 1 ? 'day' : 'days'}`}
            detail={
              streak.current > 0
                ? 'Open at least one chest today to keep it alive'
                : 'Open a chest today to start a streak'
            }
          />
          <RecordRow
            icon={<Flame size={16} />}
            label="Longest streak"
            value={`${formatNumber(streak.longest)} ${streak.longest === 1 ? 'day' : 'days'}`}
            detail="Consecutive days with at least one chest"
          />
        </div>
      </Card>
    </>
  )
}

function RecordRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-3 text-gold">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="label">{label}</span>
        <p className="tabular mt-0.5 text-lg font-bold text-ink">{value}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
    </div>
  )
}
