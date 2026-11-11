import { useMemo, useState } from 'react'
import {
  Check,
  Clock,
  Gauge,
  History as HistoryIcon,
  Package,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import type { ConfirmOptions } from '../components/ConfirmDialog'
import { useTracker } from '../state/tracker'
import { useToast } from '../state/toast'
import { sessionCount, sessionDuration, sessionRate } from '../lib/stats'
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatRelativeDay,
  formatTime,
} from '../lib/format'
import type { Session } from '../types'

type SortKey = 'recent' | 'oldest' | 'most' | 'least' | 'longest'

const sortLabels: Record<SortKey, string> = {
  recent: 'Newest first',
  oldest: 'Oldest first',
  most: 'Most chests',
  least: 'Fewest chests',
  longest: 'Longest first',
}

export function History({ confirm }: { confirm: (options: ConfirmOptions) => Promise<boolean> }) {
  const { data, activeSession, renameSession, deleteSession, restoreSession } = useTracker()
  const { push } = useToast()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const sessions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? data.sessions.filter(
          (s) =>
            s.name.toLowerCase().includes(needle) ||
            formatDate(s.startedAt).toLowerCase().includes(needle),
        )
      : data.sessions

    const sorted = [...filtered]
    switch (sort) {
      case 'oldest':
        sorted.sort((a, b) => a.startedAt - b.startedAt)
        break
      case 'most':
        sorted.sort((a, b) => sessionCount(b) - sessionCount(a))
        break
      case 'least':
        sorted.sort((a, b) => sessionCount(a) - sessionCount(b))
        break
      case 'longest':
        sorted.sort((a, b) => sessionDuration(b) - sessionDuration(a))
        break
      default:
        sorted.sort((a, b) => b.startedAt - a.startedAt)
    }
    return sorted
  }, [data.sessions, query, sort])

  const grouped = useMemo(() => {
    const groups = new Map<string, Session[]>()
    for (const s of sessions) {
      const key = formatRelativeDay(s.startedAt)
      const list = groups.get(key)
      if (list) list.push(s)
      else groups.set(key, [s])
    }
    return Array.from(groups.entries())
  }, [sessions])

  const startRename = (s: Session) => {
    setEditingId(s.id)
    setDraftName(s.name)
  }

  const commitRename = (s: Session) => {
    const name = draftName.trim()
    if (!name) {
      push('A session needs a name.', 'warning')
      return
    }
    if (name !== s.name) {
      renameSession(s.id, name)
      push('Session renamed.', 'success')
    }
    setEditingId(null)
  }

  const handleDelete = async (s: Session) => {
    const live = s.id === activeSession?.id
    const ok = await confirm({
      title: `Delete "${s.name}"?`,
      message: live
        ? `This is your running session with ${formatNumber(
            sessionCount(s),
          )} chests. Deleting it stops the session and removes its chests from your statistics.`
        : `Its ${formatNumber(
            sessionCount(s),
          )} chests are removed from your statistics. You can undo this right after.`,
      confirmLabel: 'Delete session',
    })
    if (!ok) return
    const removed = deleteSession(s.id)
    if (removed) {
      push(`"${removed.name}" deleted.`, 'danger', {
        label: 'Undo',
        run: () => restoreSession(removed, live),
      })
    }
  }

  const total = data.sessions.reduce((sum, s) => sum + sessionCount(s), 0)

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Gaming sessions"
        description={
          data.sessions.length > 0
            ? `${formatNumber(data.sessions.length)} ${
                data.sessions.length === 1 ? 'session' : 'sessions'
              } · ${formatNumber(total)} chests recorded`
            : 'Every session you finish is kept here.'
        }
      />

      {data.sessions.length > 0 ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-faint" />
            <input
              className="input pl-10"
              placeholder="Search by name or date…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search sessions"
            />
          </div>
          <label className="sr-only" htmlFor="sort">
            Sort sessions
          </label>
          <select
            id="sort"
            className="input sm:w-48"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {data.sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon size={24} />}
            title="No sessions recorded"
            description="Start counting on the dashboard. Each run shows up here with its date, duration and chest total."
          />
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={24} />}
            title="Nothing matches that search"
            description="Try another name or date."
            action={
              <button type="button" className="btn" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, group]) => (
            <section key={day}>
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="label">{day}</h2>
                <div className="hairline flex-1" />
                <span className="tabular text-xs font-semibold text-muted">
                  {formatNumber(group.reduce((sum, s) => sum + sessionCount(s), 0))} chests
                </span>
              </div>

              <ul className="space-y-3">
                {group.map((s) => {
                  const live = s.id === activeSession?.id
                  const count = sessionCount(s)
                  const rate = sessionRate(s)
                  return (
                    <li key={s.id}>
                      <Card hover className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {editingId === s.id ? (
                              <form
                                className="flex items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  commitRename(s)
                                }}
                              >
                                <input
                                  className="input max-w-xs"
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value.slice(0, 80))}
                                  aria-label="Session name"
                                  autoFocus
                                  onFocus={(e) => e.currentTarget.select()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setEditingId(null)
                                  }}
                                />
                                <button type="submit" className="btn btn-primary px-3" aria-label="Save name">
                                  <Check size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="btn px-3"
                                  onClick={() => setEditingId(null)}
                                  aria-label="Cancel renaming"
                                >
                                  <X size={16} />
                                </button>
                              </form>
                            ) : (
                              <h3 className="flex items-center gap-2 truncate text-base font-semibold text-ink">
                                {s.name}
                                {live ? (
                                  <span className="chip border-success/40 py-0 text-[10px] text-success">
                                    <span className="animate-live size-1.5 rounded-full bg-success" />
                                    Live
                                  </span>
                                ) : null}
                              </h3>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock size={13} className="text-faint" />
                                {formatTime(s.startedAt)}
                                {s.endedAt !== null ? ` – ${formatTime(s.endedAt)}` : ' – running'}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Gauge size={13} className="text-faint" />
                                {formatDuration(sessionDuration(s))}
                                {rate !== null ? ` · ${Math.round(rate)}/h` : ''}
                              </span>
                              <span className="text-faint">{formatDate(s.startedAt)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="tabular text-2xl font-bold text-ink">{formatNumber(count)}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                                chests
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost px-2.5"
                                onClick={() => startRename(s)}
                                aria-label={`Rename ${s.name}`}
                                title="Rename"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost px-2.5 hover:text-danger"
                                onClick={() => handleDelete(s)}
                                aria-label={`Delete ${s.name}`}
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          <p className="flex items-center justify-center gap-2 pt-2 text-xs text-faint">
            <Package size={14} />
            {formatNumber(sessions.length)} of {formatNumber(data.sessions.length)} sessions shown
          </p>
        </div>
      )}
    </>
  )
}
