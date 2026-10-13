import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/types/events'
import {
  clockLabel,
  clockMinutes,
  dayNames,
  newScheduleItem,
  scheduleByDay,
  scheduleSaid,
  sortSchedule,
  tidySchedule,
  tidyTime,
  whenShown,
} from './eventSchedule'

const item = (id: string, time: string, title: string, extra: Partial<ScheduleItem> = {}) =>
  ({ id, time, title, ...extra }) as ScheduleItem

describe('event schedule', () => {
  it('reads times however they are written', () => {
    expect(clockMinutes('7pm')).toBe(19 * 60)
    expect(clockMinutes('7:30 PM')).toBe(19 * 60 + 30)
    expect(clockMinutes('7:30 p.m.')).toBe(19 * 60 + 30)
    expect(clockMinutes('19:00')).toBe(19 * 60)
    expect(clockMinutes('noon')).toBe(12 * 60)
    expect(clockMinutes('12am')).toBe(0)
    expect(clockMinutes('12 pm')).toBe(12 * 60)
    expect(clockMinutes('Morning')).toBeNull()
    expect(clockMinutes('25:00')).toBeNull()
    expect(clockMinutes('7:75')).toBeNull()
  })

  it('reads a time with no am or pm as a schedule would mean it', () => {
    expect(clockMinutes('9')).toBe(9 * 60)
    expect(clockMinutes('11:30')).toBe(11 * 60 + 30)
    expect(clockMinutes('12')).toBe(12 * 60)
    expect(clockMinutes('3')).toBe(15 * 60)
    expect(clockMinutes('6:45')).toBe(18 * 60 + 45)
  })

  it('writes times out tidily, and leaves what isn’t a time as typed', () => {
    expect(clockLabel(19 * 60 + 5)).toBe('7:05 PM')
    expect(clockLabel(0)).toBe('12:00 AM')
    expect(tidyTime(' 7pm ')).toBe('7:00 PM')
    expect(tidyTime('After lunch ')).toBe('After lunch')
    expect(tidyTime('')).toBe('')
  })

  it('puts the schedule in order by day and time, untimed ones last in the order given', () => {
    const sorted = sortSchedule([
      item('a', '8:00 PM', 'Message'),
      item('b', 'Morning', 'Breakfast', { day: 1 }),
      item('c', '7:00 PM', 'Worship'),
      item('d', '', 'Clean up'),
      item('e', '9:00 AM', 'Hike', { day: 1 }),
      item('f', '', 'Pray'),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'd', 'f', 'e', 'b'])
  })

  it('tidies it to be saved: blank rows dropped, times written out, nothing undefined', () => {
    const saved = tidySchedule(
      [
        item('a', ' 8pm', ' Message ', { notes: '  ', endTime: '9pm' }),
        item('b', '', '   '),
        item('c', '7', 'Worship', { notes: 'Main hall', day: 0 }),
        item('d', '10am', 'Hike', { day: 5 }),
      ],
      2
    )
    expect(saved).toEqual([
      { id: 'c', time: '7:00 AM', title: 'Worship', notes: 'Main hall' },
      { id: 'a', time: '8:00 PM', title: 'Message', endTime: '9:00 PM' },
      // A day past the last one the event has: its last.
      { id: 'd', time: '10:00 AM', title: 'Hike', day: 1 },
    ])
    expect(JSON.stringify(saved)).not.toContain('undefined')
  })

  it('keeps a day of a one-day event at its first', () => {
    expect(tidySchedule([item('a', '9am', 'Go', { day: 2 })], 1)[0].day).toBeUndefined()
  })

  it('gives new rows ids that don’t clash', () => {
    const first = newScheduleItem([])
    const second = newScheduleItem([first], 1)
    expect(second.id).not.toBe(first.id)
    expect(second.day).toBe(1)
    expect(first.day).toBeUndefined()
  })

  it('groups by day, leaving out empty ones', () => {
    const days = scheduleByDay([item('a', '9am', 'A', { day: 2 }), item('b', '9am', 'B')])
    expect(days.map((d) => d.day)).toEqual([0, 2])
  })

  it('shows when, saying the half of the day once when both are in it', () => {
    expect(whenShown({ time: '7:00 PM', endTime: '8:30 PM' })).toBe('7:00–8:30 PM')
    expect(whenShown({ time: '11:00 AM', endTime: '1:00 PM' })).toBe('11:00 AM–1:00 PM')
    expect(whenShown({ time: '7:00 PM' })).toBe('7:00 PM')
    expect(whenShown({ time: '', endTime: '9:00 PM' })).toBe('until 9:00 PM')
  })

  it('reads it out, by day for a multi-day event, with how many more there are', () => {
    const items = [
      item('a', '7:00 PM', 'Worship', { notes: 'Main hall' }),
      item('b', '9:00 AM', 'Hike', { day: 1 }),
      item('c', '8:00 PM', 'Message'),
    ]
    expect(scheduleSaid(items, (d) => ['Friday', 'Saturday'][d])).toBe(
      'Friday: 7:00 PM, Worship (Main hall); 8:00 PM, Message. Saturday: 9:00 AM, Hike.'
    )
    expect(scheduleSaid(items, null, 1)).toBe(
      '7:00 PM, Worship (Main hall). And 2 more — it’s all on the event’s page.'
    )
    expect(scheduleSaid([], null)).toBe('')
  })

  it('names each day by its number and date, or its number alone', () => {
    expect(dayNames(['2026-10-23', '2026-10-24', ''])).toEqual([
      'Day 1 · Fri, Oct 23',
      'Day 2 · Sat, Oct 24',
      'Day 3',
    ])
  })
})
