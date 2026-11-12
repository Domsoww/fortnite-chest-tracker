import { ArrowUpRight, Clock, Flame, Package, Target, Trophy } from 'lucide-react'
import { Counter } from '../components/Counter'
import { Card, CardHeader } from '../components/Card'
import { StatCard } from '../components/StatCard'
import { MiniBars } from '../components/MiniBars'
import { EmptyState } from '../components/EmptyState'
import { ProgressRing } from '../components/ProgressRing'
import { PageHeader } from '../components/PageHeader'
import { GamingModeCard } from '../components/GamingModeCard'
import { TreasureBanner } from '../components/TreasureBanner'
import { isDesktop } from '../desktop/platform'
import type { ConfirmOptions } from '../components/ConfirmDialog'
import { useTracker } from '../state/tracker'
import { dayRange, records, sessionCount, sessionDuration, streaks, totals } from '../lib/stats'
import {
  formatDecimal,
  formatDuration,
  formatNumber,
  formatRelativeDay,
  formatTime,
} from '../lib/format'
import type { Route } from '../lib/useHashRoute'

export function Dashboard({
  confirm,
  onNavigate,
}: {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  onNavigate: (r: Route) => void
}) {
  const { data, settings, activeSession } = useTracker()
  const sessions = data.sessions
  const t = totals(sessions)
  const streak = streaks(sessions)
  const rec = records(sessions)
  const week = dayRange(sessions, 7)
  const todaySessions = week[week.length - 1]?.sessions ?? 0
  const goal = settings.dailyGoal
  const diff = t.today - t.yesterday
  const recent = sessions.slice(0, 4)

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Chest counter"
        description="Tap the button every time you crack a chest. Everything is saved on this device as you go."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Counter confirm={confirm} />

        <div className="flex flex-col gap-5">
          {/* Today */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0">
                <span className="label">Today</span>
                <p className="tabular mt-1 text-4xl font-bold text-ink">{formatNumber(t.today)}</p>
                <p className="mt-1 text-sm text-muted">
                  {todaySessions === 0
                    ? 'No session started today yet'
                    : `${formatNumber(todaySessions)} ${todaySessions === 1 ? 'session' : 'sessions'} today`}
                </p>
                {t.yesterday > 0 || t.today > 0 ? (
                  <p
                    className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
                      diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-faint'
                    }`}
                  >
                    {diff !== 0 ? (
                      <ArrowUpRight size={14} className={diff < 0 ? 'rotate-90' : ''} />
                    ) : null}
                    {diff === 0
                      ? 'Same as yesterday'
                      : `${diff > 0 ? '+' : ''}${formatNumber(diff)} vs. yesterday`}
                  </p>
                ) : null}
              </div>

              {goal > 0 ? (
                <ProgressRing value={t.today} goal={goal}>
                  <div>
                    <p className="tabular text-xl font-bold text-ink">
                      {Math.min(999, Math.round((t.today / goal) * 100))}%
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                      of {formatNumber(goal)}
                    </p>
                  </div>
                </ProgressRing>
              ) : null}
            </div>

            <div className="hairline my-5" />

            <div className="flex items-center justify-between gap-3">
              <span className="label">Last 7 days</span>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={() => onNavigate('statistics')}
              >
                All statistics <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="mt-3">
              <MiniBars data={week} />
              <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-faint">
                <span>{formatRelativeDay(week[0].ts)}</span>
                <span>Today</span>
              </div>
            </div>
          </Card>

          <TreasureBanner onOpen={() => onNavigate('treasure')} />

          {isDesktop ? <GamingModeCard onOpenSettings={() => onNavigate('settings')} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="All time"
              value={formatNumber(t.chests)}
              hint="chests opened"
              icon={<Package size={16} />}
              tone="accent"
            />
            <StatCard
              label="Day streak"
              value={formatNumber(streak.current)}
              hint={`longest ${formatNumber(streak.longest)}`}
              icon={<Flame size={16} />}
              tone="gold"
            />
            <StatCard
              label="Per session"
              value={formatDecimal(t.averagePerSession)}
              hint="average chests"
              icon={<Target size={16} />}
            />
            <StatCard
              label="Best session"
              value={rec.bestSession ? formatNumber(rec.bestSession.count) : '—'}
              hint={rec.bestSession ? rec.bestSession.session.name : 'no finished session yet'}
              icon={<Trophy size={16} />}
            />
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      <Card className="mt-5">
        <CardHeader
          title="Recent sessions"
          subtitle="Your four latest runs"
          icon={<Clock size={18} />}
          action={
            sessions.length > 0 ? (
              <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onNavigate('history')}>
                Full history <ArrowUpRight size={14} />
              </button>
            ) : undefined
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            icon={<Package size={24} />}
            title="No sessions yet"
            description="Register your first chest above and a session will be created automatically."
          />
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)] border-t border-line">
            {recent.map((s) => {
              const live = s.id === activeSession?.id
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-ink">
                      {s.name}
                      {live ? (
                        <span className="chip border-success/40 py-0 text-[10px] text-success">
                          <span className="animate-live size-1.5 rounded-full bg-success" />
                          Live
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatRelativeDay(s.startedAt)} · {formatTime(s.startedAt)} ·{' '}
                      {formatDuration(sessionDuration(s))}
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-xl font-bold text-ink">
                    {formatNumber(sessionCount(s))}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
