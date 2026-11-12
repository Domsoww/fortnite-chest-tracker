import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  formatLead,
  instantFromPrague,
  pragueDayKey,
  pragueOffsetMs,
  pragueRange,
  pragueTime,
  pragueZoneName,
} from './prague'

/** Central European clock changes in 2026:
 *   - 29 March,   02:00 CET  -> 03:00 CEST
 *   - 25 October, 03:00 CEST -> 02:00 CET */
const HOUR = 3_600_000

describe('zone labels', () => {
  it('reports CET in winter and CEST in summer', () => {
    expect(pragueZoneName(Date.UTC(2026, 0, 15, 12))).toBe('CET')
    expect(pragueZoneName(Date.UTC(2026, 6, 15, 12))).toBe('CEST')
  })

  it('switches exactly at the spring-forward instant', () => {
    // 29 March 2026, 00:59Z is still CET; 01:00Z is already CEST.
    expect(pragueZoneName(Date.UTC(2026, 2, 29, 0, 59))).toBe('CET')
    expect(pragueZoneName(Date.UTC(2026, 2, 29, 1, 0))).toBe('CEST')
  })

  it('switches exactly at the fall-back instant', () => {
    expect(pragueZoneName(Date.UTC(2026, 9, 25, 0, 59))).toBe('CEST')
    expect(pragueZoneName(Date.UTC(2026, 9, 25, 1, 0))).toBe('CET')
  })
})

describe('offset', () => {
  it('is +1h under CET and +2h under CEST', () => {
    expect(pragueOffsetMs(Date.UTC(2026, 0, 15, 12))).toBe(HOUR)
    expect(pragueOffsetMs(Date.UTC(2026, 6, 15, 12))).toBe(2 * HOUR)
  })
})

describe('displaying an instant', () => {
  it('shows a winter evening window in CET', () => {
    // The 14 November window: 19:00Z is 20:00 in Prague.
    const start = Date.parse('2026-11-14T19:00:00Z')
    const end = Date.parse('2026-11-14T21:00:00Z')
    expect(pragueTime(start)).toBe('20:00')
    expect(pragueTime(end)).toBe('22:00')
    expect(pragueRange(start, end)).toBe('20:00–22:00 CET')
  })

  it('shows the same UTC hour an hour later in summer', () => {
    const start = Date.parse('2026-07-11T19:00:00Z')
    expect(pragueTime(start)).toBe('21:00')
    expect(pragueRange(start, start + 2 * HOUR)).toBe('21:00–23:00 CEST')
  })

  it('keeps both labels for a window that straddles a clock change', () => {
    // 00:30Z is 02:30 CEST, 02:30Z is 03:30 CET on 25 October 2026.
    const start = Date.parse('2026-10-25T00:30:00Z')
    const end = Date.parse('2026-10-25T02:30:00Z')
    const text = pragueRange(start, end)
    expect(text).toContain('CEST')
    expect(text).toContain('CET')
  })

  it('uses the Prague calendar day, not UTC', () => {
    // 23:30Z on 13 November is already 00:30 on the 14th in Prague.
    expect(pragueDayKey(Date.parse('2026-11-13T23:30:00Z'))).toBe('2026-11-14')
  })
})

describe('reading a Prague wall clock', () => {
  it('maps winter times through CET', () => {
    expect(instantFromPrague('2026-01-15', '20:00')).toBe(Date.UTC(2026, 0, 15, 19, 0))
  })

  it('maps summer times through CEST', () => {
    expect(instantFromPrague('2026-07-15', '20:00')).toBe(Date.UTC(2026, 6, 15, 18, 0))
  })

  it('round-trips across both clock changes', () => {
    const days = [
      '2026-01-15',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-07-15',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-12-31',
    ]
    for (const day of days) {
      for (const time of ['09:00', '14:30', '20:00', '23:45']) {
        const instant = instantFromPrague(day, time)
        expect(instant, `${day} ${time}`).not.toBeNull()
        expect(pragueTime(instant as number), `${day} ${time}`).toBe(time)
        expect(pragueDayKey(instant as number), `${day} ${time}`).toBe(day)
      }
    }
  })

  it('resolves a wall-clock time that happens twice to its later occurrence', () => {
    // On 25 October 2026 the clock goes back at 03:00 CEST, so 02:00 happens
    // at both 00:00Z (CEST) and 01:00Z (CET). The later one is chosen, and the
    // choice is fixed rather than depending on the machine.
    const ambiguous = instantFromPrague('2026-10-25', '02:00') as number
    expect(ambiguous).toBe(Date.UTC(2026, 9, 25, 1))
    expect(pragueZoneName(ambiguous)).toBe('CET')
    // Two hours of wall clock after it really is two hours of elapsed time.
    const end = instantFromPrague('2026-10-25', '04:00') as number
    expect(end - ambiguous).toBe(2 * HOUR)
  })

  it('moves a wall-clock time that never happens to the following hour', () => {
    // 29 March 2026 jumps 02:00 CET straight to 03:00 CEST, so 02:30 does not
    // exist; it must land on a real instant rather than on NaN.
    const skipped = instantFromPrague('2026-03-29', '02:30') as number
    expect(skipped).toBe(Date.UTC(2026, 2, 29, 1, 30))
    expect(pragueTime(skipped)).toBe('03:30')
  })

  it('rejects malformed input instead of guessing', () => {
    expect(instantFromPrague('', '20:00')).toBeNull()
    expect(instantFromPrague('2026-11-14', '')).toBeNull()
    expect(instantFromPrague('14/11/2026', '20:00')).toBeNull()
    expect(instantFromPrague('2026-11-14', '25:00')).toBeNull()
    expect(instantFromPrague('2026-11-14', '20:70')).toBeNull()
  })
})

describe('countdown text', () => {
  it('scales from minutes to days', () => {
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(65_000)).toBe('01:05')
    expect(formatCountdown(3 * HOUR + 61_000)).toBe('03:01:01')
    expect(formatCountdown(26 * HOUR)).toBe('1d 02:00:00')
  })

  it('never shows a negative countdown', () => {
    expect(formatCountdown(-5000)).toBe('00:00')
  })

  it('describes a lead time in words', () => {
    expect(formatLead(0)).toBe('now')
    expect(formatLead(1)).toBe('in 1 minute')
    expect(formatLead(30)).toBe('in 30 minutes')
    expect(formatLead(120)).toBe('in 2 hours')
  })
})
