import { describe, it, expect } from 'vitest'

/**
 * Mirrors of the scheduled function's pure helpers.
 *
 * functions/ is a separate TypeScript project with its own build, and the app
 * test runner does not compile it. These copies exist so the parsing rules —
 * which decide whether someone is woken at 3am — are pinned by tests. If the
 * function changes, these must change with it.
 */
const DEFAULT_LEAD_HOURS = 3
const MIN_LEAD_HOURS = 1
const MAX_LEAD_HOURS = 48

function parseDeparture(date?: string, time?: string): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!time) return null
  const match = time
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'pm' && hour !== 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
  } else if (hour > 23) {
    return null
  }
  const ts = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
  )
  return Number.isNaN(ts) ? null : ts
}

function leadHoursFor(stored: unknown): number {
  if (stored === null || stored === undefined || stored === '') return DEFAULT_LEAD_HOURS
  const n = typeof stored === 'number' ? stored : Number(stored)
  if (!Number.isFinite(n)) return DEFAULT_LEAD_HOURS
  return Math.min(MAX_LEAD_HOURS, Math.max(MIN_LEAD_HOURS, Math.round(n)))
}

function isDue(departsAt: number, now: number, leadHours: number): boolean {
  const lead = leadHours * 60 * 60 * 1000
  const msUntil = departsAt - now
  return msUntil <= lead && msUntil > 0
}

const at = (iso: string) => Date.parse(iso)

describe('parseDeparture', () => {
  it('reads a 24-hour time', () => {
    expect(parseDeparture('2026-03-10', '14:05')).toBe(at('2026-03-10T14:05:00Z'))
  })

  it('reads 12-hour times with a meridiem', () => {
    // Coordinators type these by hand, so all the usual shapes have to work.
    expect(parseDeparture('2026-03-10', '2:05 PM')).toBe(at('2026-03-10T14:05:00Z'))
    expect(parseDeparture('2026-03-10', '2:05pm')).toBe(at('2026-03-10T14:05:00Z'))
    expect(parseDeparture('2026-03-10', '9:30 am')).toBe(at('2026-03-10T09:30:00Z'))
  })

  it('handles the midnight and noon edges', () => {
    // 12am is 00:00 and 12pm is 12:00 — the classic pair to get backwards.
    expect(parseDeparture('2026-03-10', '12:00 am')).toBe(at('2026-03-10T00:00:00Z'))
    expect(parseDeparture('2026-03-10', '12:00 pm')).toBe(at('2026-03-10T12:00:00Z'))
  })

  it('accepts a dot as the separator', () => {
    expect(parseDeparture('2026-03-10', '14.05')).toBe(at('2026-03-10T14:05:00Z'))
  })

  it('gives up rather than guessing', () => {
    // A leg we cannot read is skipped. A missing reminder beats one at 3am.
    for (const bad of ['', 'morning', 'noon', '25:00', '14:70', '13:00 pm', 'half two']) {
      expect(parseDeparture('2026-03-10', bad)).toBeNull()
    }
  })

  it('requires a well-formed date', () => {
    expect(parseDeparture(undefined, '14:05')).toBeNull()
    expect(parseDeparture('10/03/2026', '14:05')).toBeNull()
    expect(parseDeparture('', '14:05')).toBeNull()
  })
})

describe('leadHoursFor', () => {
  it('defaults to three hours', () => {
    expect(leadHoursFor(undefined)).toBe(DEFAULT_LEAD_HOURS)
    expect(leadHoursFor(null)).toBe(DEFAULT_LEAD_HOURS)
    expect(leadHoursFor('not a number')).toBe(DEFAULT_LEAD_HOURS)
  })

  it('honours a chosen value', () => {
    expect(leadHoursFor(6)).toBe(6)
    expect(leadHoursFor(24)).toBe(24)
  })

  it('clamps values that would silence or spam', () => {
    // 0 would fire continuously; 500 would remind three weeks out.
    expect(leadHoursFor(0)).toBe(MIN_LEAD_HOURS)
    expect(leadHoursFor(-5)).toBe(MIN_LEAD_HOURS)
    expect(leadHoursFor(500)).toBe(MAX_LEAD_HOURS)
  })
})

describe('isDue', () => {
  const departs = at('2026-03-10T14:00:00Z')

  it('is not due before the window opens', () => {
    expect(isDue(departs, at('2026-03-10T10:00:00Z'), 3)).toBe(false)
  })

  it('is due inside the window', () => {
    expect(isDue(departs, at('2026-03-10T11:30:00Z'), 3)).toBe(true)
    expect(isDue(departs, at('2026-03-10T13:59:00Z'), 3)).toBe(true)
  })

  it('is due exactly on the boundary', () => {
    expect(isDue(departs, at('2026-03-10T11:00:00Z'), 3)).toBe(true)
  })

  it('stops once the flight has left', () => {
    // Nobody wants a reminder about a plane already in the air.
    expect(isDue(departs, at('2026-03-10T14:00:00Z'), 3)).toBe(false)
    expect(isDue(departs, at('2026-03-10T15:00:00Z'), 3)).toBe(false)
  })

  it('respects a longer chosen lead time', () => {
    expect(isDue(departs, at('2026-03-10T04:00:00Z'), 3)).toBe(false)
    expect(isDue(departs, at('2026-03-10T04:00:00Z'), 12)).toBe(true)
  })
})
