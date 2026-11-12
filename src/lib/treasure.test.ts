import { describe, expect, it } from 'vitest'
// The schedule that ships with the app, checked as part of the suite so a bad
// edit to it fails the build rather than the user's countdown.
import shippedSchedule from '../../public/treasure-hours.json'
import type { Session, TreasureSettings, TreasureWindow } from '../types'
import {
  allWindows,
  dueReminders,
  emptyTreasureCache,
  defaultTreasureSettings,
  eventWindow,
  parseFeed,
  parseInstant,
  rememberNotified,
  reminderKey,
  reminderText,
  treasureSplit,
  treasureState,
  windowAt,
} from './treasure'

const HOUR = 3_600_000

function makeWindow(partial: Partial<TreasureWindow> & { id: string; startsAt: number }): TreasureWindow {
  return {
    endsAt: partial.startsAt + 2 * HOUR,
    status: 'confirmed',
    multiplier: null,
    multiplierConfirmed: false,
    boosts: [],
    sources: [],
    ...partial,
  }
}

const settings = (patch: Partial<TreasureSettings> = {}): TreasureSettings => ({
  ...defaultTreasureSettings(),
  ...patch,
})

/* ------------------------------------------------------------------ */

describe('parsing instants', () => {
  it('accepts an explicit zone', () => {
    expect(parseInstant('2026-11-14T19:00:00Z')).toBe(Date.UTC(2026, 10, 14, 19))
    expect(parseInstant('2026-11-14T20:00:00+01:00')).toBe(Date.UTC(2026, 10, 14, 19))
  })

  it('refuses a timestamp with no zone rather than guessing one', () => {
    // This is the bug class that silently moves a schedule by an hour.
    expect(parseInstant('2026-11-14T19:00:00')).toBeNull()
    expect(parseInstant('2026-11-14')).toBeNull()
    expect(parseInstant('tomorrow')).toBeNull()
    expect(parseInstant(null)).toBeNull()
  })
})

describe('parsing a feed', () => {
  it('reads windows, odds and provenance', () => {
    const result = parseFeed({
      kind: 'treasure-hours',
      version: 1,
      generatedAt: '2026-11-12T00:00:00Z',
      baseOdds: { perChest: 137500, confirmed: true, sources: [{ label: 'Epic' }] },
      windows: [
        {
          id: 'w1',
          startsAt: '2026-11-14T19:00:00Z',
          endsAt: '2026-11-14T21:00:00Z',
          status: 'confirmed',
          multiplier: 1.5,
          multiplierConfirmed: true,
          sources: [{ label: 'Epic', url: 'https://example.com', verifiedAt: '2026-11-12T00:00:00Z' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.feed?.windows).toHaveLength(1)
    expect(result.feed?.windows[0].multiplier).toBe(1.5)
    expect(result.feed?.baseOdds?.perChest).toBe(137500)
    expect(result.feed?.windows[0].sources[0].url).toBe('https://example.com')
  })

  it('treats an unmarked multiplier as unconfirmed', () => {
    const result = parseFeed({
      kind: 'treasure-hours',
      windows: [
        { id: 'w', startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z', multiplier: 2 },
      ],
    })
    expect(result.feed?.windows[0].multiplier).toBe(2)
    expect(result.feed?.windows[0].multiplierConfirmed).toBe(false)
  })

  it('drops unusable windows and counts them', () => {
    const result = parseFeed({
      kind: 'treasure-hours',
      windows: [
        { id: 'ok', startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z' },
        { id: 'backwards', startsAt: '2026-11-14T21:00:00Z', endsAt: '2026-11-14T19:00:00Z' },
        { id: 'zoneless', startsAt: '2026-11-14T19:00:00', endsAt: '2026-11-14T21:00:00' },
        'nonsense',
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.feed?.windows).toHaveLength(1)
    expect(result.skipped).toBe(3)
  })

  it('refuses a newer format instead of misreading it', () => {
    const result = parseFeed({ kind: 'treasure-hours', version: 99, windows: [] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('v99')
  })

  it('refuses a file that is not a schedule', () => {
    expect(parseFeed({ kind: 'something-else', windows: [] }).ok).toBe(false)
    expect(parseFeed('nope').ok).toBe(false)
    expect(parseFeed({ kind: 'treasure-hours' }).ok).toBe(false)
  })
})

describe('the schedule shipped with the app', () => {
  const result = parseFeed(shippedSchedule)

  it('parses', () => {
    expect(result.ok).toBe(true)
    expect(result.skipped).toBe(0)
    expect(result.feed?.windows.length).toBeGreaterThan(0)
  })

  it('cites a source for every window and every multiplier', () => {
    for (const w of result.feed?.windows ?? []) {
      expect(w.sources.length, w.id).toBeGreaterThan(0)
      // A confirmed multiplier must come with the announcement that set it.
      if (w.multiplierConfirmed) expect(w.sources.some((s) => s.url), w.id).toBe(true)
    }
  })

  it('only marks a multiplier confirmed on a confirmed window', () => {
    for (const w of result.feed?.windows ?? []) {
      if (w.multiplierConfirmed) expect(w.status, w.id).toBe('confirmed')
    }
  })
})

/* ------------------------------------------------------------------ */

describe('state machine', () => {
  const start = Date.UTC(2026, 10, 14, 19)
  const windows = [
    makeWindow({ id: 'past', startsAt: start - 7 * 24 * HOUR }),
    makeWindow({ id: 'now', startsAt: start }),
    makeWindow({ id: 'later', startsAt: start + 7 * HOUR }),
  ]

  it('says nothing is known when there is no schedule', () => {
    const state = treasureState([], start)
    expect(state.phase).toBe('unknown')
    expect(state.next).toBeNull()
  })

  it('is upcoming before the window opens', () => {
    const state = treasureState(windows, start - 60_000)
    expect(state.phase).toBe('upcoming')
    expect(state.next?.id).toBe('now')
    expect(state.msToStart).toBe(60_000)
    expect(state.current).toBeNull()
  })

  it('is active on the opening instant', () => {
    const state = treasureState(windows, start)
    expect(state.phase).toBe('active')
    expect(state.current?.id).toBe('now')
    expect(state.msToEnd).toBe(2 * HOUR)
    expect(state.next?.id).toBe('later')
  })

  it('closes the window on its last instant, not after it', () => {
    expect(treasureState(windows, start + 2 * HOUR - 1).phase).toBe('active')
    const after = treasureState(windows, start + 2 * HOUR)
    expect(after.phase).toBe('upcoming')
    expect(after.current).toBeNull()
  })

  it('is inactive once every window has passed', () => {
    const state = treasureState(windows, start + 30 * 24 * HOUR)
    expect(state.phase).toBe('inactive')
    expect(state.next).toBeNull()
    expect(state.past).toHaveLength(3)
  })

  it('finds the window covering an instant', () => {
    expect(windowAt(windows, start + HOUR)?.id).toBe('now')
    expect(windowAt(windows, start - HOUR)).toBeNull()
  })
})

describe('merging the feed with hand-entered windows', () => {
  const base = Date.UTC(2026, 10, 14, 19)
  const cache = {
    ...emptyTreasureCache(),
    feed: {
      version: 1,
      generatedAt: null,
      notice: null,
      baseOdds: null,
      windows: [
        makeWindow({ id: 'confirmed', startsAt: base }),
        makeWindow({ id: 'reported', startsAt: base + 7 * HOUR, status: 'reported' }),
      ],
    },
    manual: [makeWindow({ id: 'mine', startsAt: base + 24 * HOUR, status: 'manual' })],
  }

  it('includes everything by default', () => {
    expect(allWindows(cache, settings()).map((w) => w.id)).toEqual(['confirmed', 'reported', 'mine'])
  })

  it('can hide windows Epic has not confirmed, but never the user\'s own', () => {
    const ids = allWindows(cache, settings({ includeUnconfirmed: false })).map((w) => w.id)
    expect(ids).toEqual(['confirmed', 'mine'])
  })
})

/* ------------------------------------------------------------------ */

describe('reminders', () => {
  const start = Date.UTC(2026, 10, 14, 19)
  const windows = [makeWindow({ id: 'w', startsAt: start })]
  const armed = settings({ leads: [30, 15, 5, 0] })

  it('fires nothing while every lead is still in the future', () => {
    expect(dueReminders(windows, armed, [], start - 31 * 60_000)).toHaveLength(0)
  })

  it('fires a lead at its moment', () => {
    const due = dueReminders(windows, armed, [], start - 30 * 60_000)
    expect(due.map((r) => r.lead)).toEqual([30])
    expect(due[0].key).toBe(reminderKey('w', 30))
  })

  it('fires the start reminder at the opening instant', () => {
    const due = dueReminders(windows, armed, [reminderKey('w', 30), reminderKey('w', 15), reminderKey('w', 5)], start)
    expect(due.map((r) => r.lead)).toEqual([0])
  })

  it('never fires the same reminder twice', () => {
    const now = start - 30 * 60_000
    const first = dueReminders(windows, armed, [], now)
    expect(first).toHaveLength(1)
    const second = dueReminders(windows, armed, first.map((r) => r.key), now)
    expect(second).toHaveLength(0)
  })

  it('does not fire stale reminders when the app starts late', () => {
    // Launched twenty minutes after the 30-minute mark: that one is gone.
    expect(dueReminders(windows, armed, [], start - 10 * 60_000).map((r) => r.lead)).toEqual([])
  })

  it('stays silent while reminders are switched off', () => {
    const off = settings({ notifications: false, leads: [30] })
    expect(dueReminders(windows, off, [], start - 30 * 60_000)).toHaveLength(0)
  })

  it('honours which leads are armed', () => {
    const only5 = settings({ leads: [5] })
    expect(dueReminders(windows, only5, [], start - 30 * 60_000)).toHaveLength(0)
    expect(dueReminders(windows, only5, [], start - 5 * 60_000)).toHaveLength(1)
  })

  it('ignores windows that have already finished', () => {
    const over = [makeWindow({ id: 'old', startsAt: start - 10 * HOUR })]
    expect(dueReminders(over, armed, [], start)).toHaveLength(0)
  })

  it('caps the remembered keys', () => {
    const many = Array.from({ length: 250 }, (_, i) => `w${i}:0`)
    const kept = rememberNotified(many, ['new:0'], 200)
    expect(kept).toHaveLength(200)
    expect(kept[kept.length - 1]).toBe('new:0')
  })

  it('does not duplicate a key it already remembers', () => {
    const kept = rememberNotified(['a:0', 'b:0'], ['a:0'])
    expect(kept).toEqual(['b:0', 'a:0'])
  })

  it('mentions a multiplier only when it is confirmed', () => {
    const confirmed = reminderText({
      key: 'k',
      lead: 0,
      window: makeWindow({ id: 'w', startsAt: start, multiplier: 2, multiplierConfirmed: true }),
    })
    expect(confirmed.body).toContain('2×')

    const unconfirmed = reminderText({
      key: 'k',
      lead: 0,
      window: makeWindow({ id: 'w', startsAt: start, multiplier: 2, multiplierConfirmed: false }),
    })
    expect(unconfirmed.body).not.toContain('2×')
  })
})

/* ------------------------------------------------------------------ */

describe('splitting chests by window', () => {
  const start = Date.UTC(2026, 10, 14, 19)
  const windows = [makeWindow({ id: 'w1', startsAt: start })]

  const session = (events: Session['events']): Session => ({
    id: 's',
    name: 'Session',
    startedAt: start - HOUR,
    endedAt: null,
    events,
    pauses: [],
  })

  it('uses the tag written at counting time', () => {
    const split = treasureSplit(
      [session([{ id: 'a', ts: start + 60_000, delta: 1, kind: 'chest', th: 'w1' }])],
      windows,
    )
    expect(split.inside).toBe(1)
    expect(split.outside).toBe(0)
  })

  it('classifies untagged events by their timestamp', () => {
    const split = treasureSplit(
      [
        session([
          { id: 'a', ts: start + 60_000, delta: 1, kind: 'chest' },
          { id: 'b', ts: start + 3 * HOUR, delta: 1, kind: 'chest' },
        ]),
      ],
      windows,
    )
    expect(split.inside).toBe(1)
    expect(split.outside).toBe(1)
  })

  it('keeps a tagged chest inside its window even if the times moved', () => {
    const moved = [makeWindow({ id: 'w1', startsAt: start + 48 * HOUR })]
    const split = treasureSplit(
      [session([{ id: 'a', ts: start + 60_000, delta: 1, kind: 'chest', th: 'w1' }])],
      moved,
    )
    expect(split.inside).toBe(1)
  })

  it('reports history older than the schedule separately', () => {
    const split = treasureSplit(
      [session([{ id: 'old', ts: start - 30 * 24 * HOUR, delta: 5, kind: 'chest' }])],
      windows,
    )
    expect(split.untagged).toBe(5)
    expect(split.outside).toBe(0)
    expect(split.inside).toBe(0)
  })

  it('ignores manual adjustments, which have no moment of their own', () => {
    const split = treasureSplit(
      [session([{ id: 'adj', ts: start + 60_000, delta: 10, kind: 'adjust' }])],
      windows,
    )
    expect(split.inside).toBe(0)
    expect(split.outside).toBe(0)
  })

  it('totals per window', () => {
    const split = treasureSplit(
      [
        session([
          { id: 'a', ts: start + 60_000, delta: 1, kind: 'chest' },
          { id: 'b', ts: start + 120_000, delta: 1, kind: 'chest' },
        ]),
      ],
      windows,
    )
    expect(split.perWindow).toEqual([{ window: windows[0], chests: 2 }])
  })

  it('resolves a tagged event whose window is no longer known', () => {
    const split = treasureSplit(
      [session([{ id: 'a', ts: start + 60_000, delta: 1, kind: 'chest', th: 'deleted' }])],
      windows,
    )
    // Falls back to the timestamp, which still lands inside w1.
    expect(split.inside).toBe(1)
  })
})

describe('event classification', () => {
  const start = Date.UTC(2026, 10, 14, 19)
  const windows = [makeWindow({ id: 'w1', startsAt: start })]

  it('prefers the tag over the timestamp', () => {
    const outside = { id: 'e', ts: start + 10 * HOUR, delta: 1, kind: 'chest' as const, th: 'w1' }
    expect(eventWindow(outside, windows)?.id).toBe('w1')
  })

  it('returns null outside every window', () => {
    expect(eventWindow({ id: 'e', ts: start - HOUR, delta: 1, kind: 'chest' }, windows)).toBeNull()
  })
})
