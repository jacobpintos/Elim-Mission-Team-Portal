import { describe, expect, it } from 'vitest'
import { eventNamed } from './eventNamed'
import type { EventTemplate } from '@/types/events'

const ev = (id: number, title: string, extra: Partial<EventTemplate> = {}) =>
  ({ id, title, date: '2026-11-20', isRec: false, ...extra }) as EventTemplate

describe('the event a notification names', () => {
  const events = [
    ev(1, 'Revive Me'),
    ev(2, 'Revive Me Again', { date: '2026-12-04' }),
    ev(3, 'Youth Night', { isRec: true, recDay: 5, recur: 'weekly', date: '2026-01-02' }),
  ]

  it('the longest title said in it — never one inside another', () => {
    expect(
      eventNamed("You've been added to Revive Me", events, {}, '2026-11-05')?.instanceKey
    ).toBe('1_2026-11-20')
    expect(
      eventNamed("You've been added to Revive Me Again", events, {}, '2026-11-05')?.instanceKey
    ).toBe('2_2026-12-04')
  })

  it('a weekly one at its next date', () => {
    // Fridays: the 6th is the next from Thursday the 5th.
    expect(
      eventNamed('Reminder: Youth Night is coming up', events, {}, '2026-11-05')?.instanceKey
    ).toBe('3_2026-11-06')
  })

  it('one that has passed, at its last date', () => {
    expect(eventNamed('Added to Revive Me', events, {}, '2026-12-01')?.instanceKey).toBe(
      '1_2026-11-20'
    )
  })

  it('none, when no title is said', () => {
    expect(eventNamed("You've been added to an event", events, {}, '2026-11-05')).toBeNull()
    expect(eventNamed('', events, {}, '2026-11-05')).toBeNull()
  })
})
