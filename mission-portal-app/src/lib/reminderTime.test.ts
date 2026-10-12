import { describe, expect, it } from 'vitest'
import {
  clockOf,
  nextOccurrence,
  zonedParts,
  zonedTime,
} from '../../functions/src/push/reminderTime'

const CHI = 'America/Chicago'
const at = (ms: number) => {
  const p = zonedParts(ms, CHI)
  return `${p.y}-${p.m}-${p.d} ${p.h}:${String(p.min).padStart(2, '0')} wd${p.wd}`
}

describe('reminder times where they are', () => {
  it('turns a wall-clock time into the moment it happens', () => {
    expect(at(zonedTime(2026, 10, 18, 8, 0, CHI))).toBe('2026-10-18 8:00 wd0')
  })
  it('repeats at the same time of day through the clocks going back', () => {
    // Clocks go back on Sunday, November 1, 2026.
    const sat = zonedTime(2026, 10, 31, 8, 0, CHI)
    expect(at(nextOccurrence(sat, 'daily', CHI))).toBe('2026-11-1 8:00 wd0')
    expect(at(nextOccurrence(sat, 'weekly', CHI))).toBe('2026-11-7 8:00 wd6')
  })
  it('skips the weekend for weekdays, and keeps the day of the month', () => {
    const fri = zonedTime(2026, 10, 16, 7, 30, CHI)
    expect(at(nextOccurrence(fri, 'weekdays', CHI))).toBe('2026-10-19 7:30 wd1')
    const jan31 = zonedTime(2027, 1, 31, 9, 0, CHI)
    expect(at(nextOccurrence(jan31, 'monthly', CHI))).toBe('2027-2-28 9:00 wd0')
  })
  it('catches up past now when it has fallen behind', () => {
    const start = zonedTime(2026, 10, 1, 8, 0, CHI)
    const now = zonedTime(2026, 10, 18, 12, 0, CHI)
    expect(at(nextOccurrence(start, 'daily', CHI, now))).toBe('2026-10-19 8:00 wd1')
  })
  it('reads event times', () => {
    expect(clockOf('5 PM')).toEqual({ h: 17, min: 0 })
    expect(clockOf('10:30 am')).toEqual({ h: 10, min: 30 })
    expect(clockOf('12 AM')).toEqual({ h: 0, min: 0 })
    expect(clockOf('soon')).toBeNull()
  })
})
