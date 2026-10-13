import { describe, expect, it } from 'vitest'
import {
  beforeEventAt,
  beforeEventSaid,
  nextBeforeEvent,
  sentWith,
  type StoredEvent,
} from '../../functions/src/push/everyEvent'

/**
 * A reminder before every one of their events, as the server keeps it on the
 * next of them (functions/src/push/everyEvent).
 */

const tz = 'America/Chicago' // CDT, five hours behind UTC, in October
// Tuesday, October 13 2026, 3 PM in Chicago.
const now = Date.UTC(2026, 9, 13, 20, 0)

const events = [
  // Every Friday at 7 PM.
  { id: 'yn', title: 'Youth Night', isRec: true, recDay: 5, startTime: '7:00 PM', users: ['me'] },
  // Theirs through a group; two days.
  {
    id: 'ret',
    title: 'Youth Retreat',
    date: '2026-10-30',
    startTime: '4:00 PM',
    users: ['other'],
    groups: ['g1'],
    extraDays: [{ date: '2026-10-31', startTime: '9:00 AM' }],
  },
  {
    id: 'draft',
    title: 'Draft',
    date: '2026-10-14',
    startTime: '9:00 AM',
    users: ['me'],
    unpublished: true,
  },
  {
    id: 'gone',
    title: 'Gone',
    date: '2026-10-14',
    startTime: '9:00 AM',
    users: ['me'],
    deleted: true,
  },
  { id: 'notime', title: 'No time set', date: '2026-10-14', users: ['me'] },
  {
    id: 'off',
    title: 'Called off',
    date: '2026-10-15',
    startTime: '8:00 PM',
    users: ['me'],
    overrides: { 'off_2026-10-15': { deleted: true } },
  },
  {
    id: 'notmine',
    title: 'Not theirs',
    date: '2026-10-14',
    startTime: '9:00 AM',
    users: ['other'],
  },
] as unknown as StoredEvent[]
const groups = [{ id: 'g1', name: 'Youth team', members: ['me'] }]
const hourBefore = { uid: 'me', tz, minutesBefore: 60 }

describe('the next of their events', () => {
  it('an hour before its start, in their time zone — passing over what isn’t theirs, drafts, deleted, called off and untimed', () => {
    // Friday 7 PM in Chicago is midnight UTC; an hour before, 23:00 UTC Friday.
    expect(nextBeforeEvent(hourBefore, events, groups, now)).toEqual({
      remindAt: Date.UTC(2026, 9, 16, 23, 0),
      eventKey: 'yn_2026-10-16',
      eventTemplateId: 'yn',
      eventTitle: 'Youth Night',
    })
  })

  it('never again for one it was sent for: on to the next', () => {
    expect(
      nextBeforeEvent({ ...hourBefore, sentKeys: ['yn_2026-10-16'] }, events, groups, now)?.eventKey
    ).toBe('yn_2026-10-23')
  })

  it('theirs through a group, and a multi-day event once, by its first day', () => {
    // After the 23rd's: the retreat (Oct 30, 4 PM) comes before that Friday's youth night (7 PM).
    const after = Date.UTC(2026, 9, 24, 12, 0)
    expect(nextBeforeEvent(hourBefore, events, groups, after)?.eventKey).toBe('ret_2026-10-30')
    const afterRetreat = Date.UTC(2026, 9, 31, 1, 0)
    expect(nextBeforeEvent(hourBefore, events, groups, afterRetreat)?.eventKey).toBe(
      'yn_2026-11-06'
    )
  })

  it('so many days before, at an hour — an event with no time counts', () => {
    const dayBefore = { uid: 'me', tz, daysBefore: 1, atHour: 19 }
    // No time set (Wednesday) — the evening before is tonight, 7 PM.
    expect(nextBeforeEvent(dayBefore, events, groups, now)).toMatchObject({
      eventKey: 'notime_2026-10-14',
      remindAt: Date.UTC(2026, 9, 14, 0, 0),
    })
  })

  it('none of theirs: none', () => {
    expect(
      nextBeforeEvent({ uid: 'nobody', tz, minutesBefore: 60 }, events, groups, now)
    ).toBeNull()
  })

  it('by minutes, an event with no start time has no time for it', () => {
    expect(beforeEventAt(hourBefore, '2026-10-14', undefined)).toBeNull()
    expect(beforeEventAt(hourBefore, '2026-10-14', '9:00 AM')).toBe(Date.UTC(2026, 9, 14, 13, 0))
  })
})

describe('what its push says, and what it keeps', () => {
  it('says the event and when', () => {
    expect(beforeEventSaid({ uid: 'me', minutesBefore: 60, text: 'Pray' }, 'Youth Night')).toBe(
      'Pray — Youth Night starts in 1 hour'
    )
    expect(beforeEventSaid({ uid: 'me', minutesBefore: 30 }, 'Youth Night')).toBe(
      'Youth Night starts in 30 minutes'
    )
    expect(beforeEventSaid({ uid: 'me', daysBefore: 1, text: 'Pack' }, 'Youth Retreat')).toBe(
      'Pack — Youth Retreat is tomorrow'
    )
    expect(beforeEventSaid({ uid: 'me', daysBefore: 0 }, 'Youth Retreat')).toBe(
      'Youth Retreat is today'
    )
  })

  it('the events it was sent for: each once, the latest kept', () => {
    expect(sentWith(['a', 'b'], 'a')).toEqual(['b', 'a'])
    expect(sentWith(undefined, undefined)).toEqual([])
    const many = Array.from({ length: 25 }, (_, i) => `k${i}`)
    expect(sentWith(many, 'new')).toHaveLength(20)
    expect(sentWith(many, 'new').at(-1)).toBe('new')
  })
})
