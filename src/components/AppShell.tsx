import type { ReactNode } from 'react'
import { BarChart3, History, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'
import type { Route } from '../lib/useHashRoute'
import { Logo } from './Logo'
import { useTracker } from '../state/tracker'
import { formatNumber } from '../lib/format'
import { totals } from '../lib/stats'

const navItems: { route: Route; label: string; Icon: typeof LayoutDashboard }[] = [
  { route: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { route: 'history', label: 'History', Icon: History },
  { route: 'statistics', label: 'Statistics', Icon: BarChart3 },
  { route: 'settings', label: 'Settings', Icon: SettingsIcon },
]

export function AppShell({
  route,
  onNavigate,
  children,
}: {
  route: Route
  onNavigate: (r: Route) => void
  children: ReactNode
}) {
  const { data, activeSession } = useTracker()
  const allTime = totals(data.sessions)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-3 rounded-2xl px-2 py-1 text-left"
        >
          <Logo />
          <span>
            <span className="block text-base font-bold leading-tight text-ink">Chest Tracker</span>
            <span className="block text-xs font-medium text-faint">Loot session dashboard</span>
          </span>
        </button>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {navItems.map(({ route: r, label, Icon }) => {
            const active = r === route
            return (
              <button
                key={r}
                type="button"
                onClick={() => onNavigate(r)}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border border-line-strong bg-surface-2 text-ink'
                    : 'border border-transparent text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <Icon size={18} className={active ? 'text-accent' : 'text-faint group-hover:text-accent'} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <span className="label">All time</span>
            <p className="tabular mt-1 text-2xl font-bold text-ink">{formatNumber(allTime.chests)}</p>
            <p className="text-xs text-muted">
              chests across {formatNumber(allTime.sessions)}{' '}
              {allTime.sessions === 1 ? 'session' : 'sessions'}
            </p>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-faint">
            Everything is stored on this device only. Nothing is ever uploaded.
          </p>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-sm font-bold text-ink">Chest Tracker</span>
        </div>
        {activeSession ? (
          <span className="chip border-success/40 text-success">
            <span className="animate-live size-1.5 rounded-full bg-success" />
            Live
          </span>
        ) : (
          <span className="chip">{formatNumber(allTime.chests)} all time</span>
        )}
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-10 lg:pb-12">
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Main"
      >
        {navItems.map(({ route: r, label, Icon }) => {
          const active = r === route
          return (
            <button
              key={r}
              type="button"
              onClick={() => onNavigate(r)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-accent' : 'text-faint'
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
