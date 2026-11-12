import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, buildExport, emptyData, mergeData, validateAppData } from './storage'
import { DEFAULT_FEED_URL } from './treasure'

/** Data exactly as schema v1 wrote it: no pauses, no desktop block, no
 *  Treasure Hours. Upgrading must never drop any of it. */
const v1 = {
  app: 'fortnite-chest-tracker',
  version: 1,
  activeSessionId: 's1',
  sessions: [
    {
      id: 's1',
      name: 'Friday grind',
      startedAt: Date.UTC(2026, 2, 6, 18),
      endedAt: null,
      events: [
        { id: 'e1', ts: Date.UTC(2026, 2, 6, 18, 5), delta: 1, kind: 'chest' },
        { id: 'e2', ts: Date.UTC(2026, 2, 6, 18, 6), delta: 4, kind: 'adjust' },
      ],
    },
  ],
  settings: { theme: 'light', accent: 'gold', dailyGoal: 120 },
}

describe('migrating older data', () => {
  const result = validateAppData(v1)

  it('accepts it', () => {
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('keeps the sessions, events and settings', () => {
    expect(result.data?.sessions).toHaveLength(1)
    expect(result.data?.sessions[0].events).toHaveLength(2)
    expect(result.data?.sessions[0].name).toBe('Friday grind')
    expect(result.data?.activeSessionId).toBe('s1')
    expect(result.data?.settings.theme).toBe('light')
    expect(result.data?.settings.dailyGoal).toBe(120)
  })

  it('fills in the new blocks with defaults', () => {
    expect(result.data?.version).toBe(SCHEMA_VERSION)
    expect(result.data?.sessions[0].pauses).toEqual([])
    expect(result.data?.settings.desktop.hotkeys.add.accelerator).toBe('CommandOrControl+Shift+1')
    expect(result.data?.settings.treasure.enabled).toBe(true)
    expect(result.data?.settings.treasure.feedUrl).toBe(DEFAULT_FEED_URL)
    expect(result.data?.treasure.feed).toBeNull()
    expect(result.data?.treasure.manual).toEqual([])
    expect(result.data?.treasure.notified).toEqual([])
  })

  it('leaves older events untagged rather than inventing a window', () => {
    expect(result.data?.sessions[0].events[0].th).toBeUndefined()
  })
})

describe('reading v3 data back', () => {
  it('keeps treasure tags, settings, hand-entered windows and fired reminders', () => {
    const start = Date.UTC(2026, 10, 14, 19)
    const round = validateAppData({
      app: 'fortnite-chest-tracker',
      version: 3,
      activeSessionId: null,
      sessions: [
        {
          id: 's',
          name: 'S',
          startedAt: start,
          endedAt: start + 3_600_000,
          events: [{ id: 'e', ts: start + 60_000, delta: 1, kind: 'chest', th: 'w1' }],
          pauses: [{ from: start + 100, to: start + 200 }],
        },
      ],
      settings: { treasure: { leads: [5], notifications: false, refreshMinutes: 45 } },
      treasure: {
        origin: 'remote',
        fetchedAt: start,
        lastError: 'no connection to the schedule',
        notified: ['w1:5'],
        feed: {
          version: 1,
          windows: [
            { id: 'w1', startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z' },
          ],
        },
        manual: [
          { id: 'mine', startsAt: '2026-11-21T19:00:00Z', endsAt: '2026-11-21T21:00:00Z' },
        ],
      },
    })

    expect(round.ok).toBe(true)
    expect(round.data?.sessions[0].events[0].th).toBe('w1')
    expect(round.data?.sessions[0].pauses).toHaveLength(1)
    expect(round.data?.settings.treasure.leads).toEqual([5])
    expect(round.data?.settings.treasure.notifications).toBe(false)
    expect(round.data?.settings.treasure.refreshMinutes).toBe(45)
    expect(round.data?.treasure.notified).toEqual(['w1:5'])
    expect(round.data?.treasure.feed?.windows).toHaveLength(1)
    expect(round.data?.treasure.manual).toHaveLength(1)
    // Anything the user typed stays marked as theirs after a reload.
    expect(round.data?.treasure.manual[0].status).toBe('manual')
    // A restored feed is never presented as a fresh download.
    expect(round.data?.treasure.origin).toBe('cache')
  })

  it('repairs a broken schedule address instead of rejecting the file', () => {
    const result = validateAppData({
      sessions: [],
      settings: { treasure: { feedUrl: 'javascript:alert(1)' } },
    })
    expect(result.ok).toBe(true)
    expect(result.data?.settings.treasure.feedUrl).toBe(DEFAULT_FEED_URL)
    expect(result.warnings.join(' ')).toContain('schedule address')
  })

  it('allows an empty address, meaning the bundled schedule only', () => {
    const result = validateAppData({ sessions: [], settings: { treasure: { feedUrl: '  ' } } })
    expect(result.data?.settings.treasure.feedUrl).toBe('')
  })

  it('refuses data from a newer app', () => {
    const result = validateAppData({ version: 99, sessions: [] })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('v99')
  })
})

describe('export and merge', () => {
  it('carries the treasure block into an export', () => {
    const data = emptyData()
    const file = buildExport(data)
    expect(file.version).toBe(SCHEMA_VERSION)
    expect(file.treasure).toBeDefined()
  })

  it('merges hand-entered windows from another device without duplicating them', () => {
    const start = Date.UTC(2026, 10, 21, 19)
    const mine = {
      ...emptyData(),
      treasure: {
        ...emptyData().treasure,
        manual: [
          {
            id: 'shared',
            startsAt: start,
            endsAt: start + 7_200_000,
            status: 'manual' as const,
            multiplier: null,
            multiplierConfirmed: false,
            boosts: [],
            sources: [],
          },
        ],
      },
    }
    const theirs = {
      ...emptyData(),
      treasure: {
        ...emptyData().treasure,
        manual: [
          ...mine.treasure.manual,
          {
            id: 'other',
            startsAt: start + 24 * 3_600_000,
            endsAt: start + 26 * 3_600_000,
            status: 'manual' as const,
            multiplier: null,
            multiplierConfirmed: false,
            boosts: [],
            sources: [],
          },
        ],
      },
    }

    const merged = mergeData(mine, theirs)
    expect(merged.treasure.manual.map((w) => w.id)).toEqual(['shared', 'other'])
  })
})
