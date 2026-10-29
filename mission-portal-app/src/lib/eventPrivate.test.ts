import { describe, expect, it } from 'vitest'
import {
  EVERYONE,
  eventAccess,
  eventSeenBy,
  mergeEvent,
  sameAccess,
  splitFields,
  strays,
  withMoved,
  withoutPrivate,
} from '../../functions/src/eventPrivate'
import { digestEventsFor } from '../../functions/src/digest'

const teams = [{ name: 'Worship', leaders: ['lee'], members: ['sam'] }]
const groups = [{ id: 'g1', members: ['ann', 'bo'] }]

describe('an event’s private details, kept apart', () => {
  it('are split from what anyone who sees the event reads', () => {
    expect(
      splitFields({
        title: 'Gala',
        startTime: '6 PM',
        users: ['me'],
        foodItems: ['Pie'],
        teams,
        dressCode: [{ group: '_remainder_', text: 'Black' }],
        reportTimes: [{ group: '_remainder_', time: '5:00 PM' }],
        flightEntries: [],
      })
    ).toEqual({
      open: { title: 'Gala', startTime: '6 PM', users: ['me'], foodItems: ['Pie'] },
      closed: {
        teams,
        dressCode: [{ group: '_remainder_', text: 'Black' }],
        reportTimes: [{ group: '_remainder_', time: '5:00 PM' }],
        flightEntries: [],
      },
    })
  })

  it('are read back as one, date by date too — never the access list', () => {
    const open = {
      title: 'Sunday',
      overrides: { 's_2026-11-01': { startTime: '9 AM' }, 's_2026-11-08': { deleted: true } },
    }
    const closed = {
      teams,
      access: ['lee', 'sam'],
      overrides: { 's_2026-11-01': { reportTimes: [{ group: '_remainder_', time: '8 AM' }] } },
    }
    expect(mergeEvent(open, closed)).toEqual({
      title: 'Sunday',
      teams,
      overrides: {
        's_2026-11-01': {
          startTime: '9 AM',
          reportTimes: [{ group: '_remainder_', time: '8 AM' }],
        },
        's_2026-11-08': { deleted: true },
      },
    })
    expect(mergeEvent(open, null)).toBe(open)
  })

  it('are left out for someone not on it', () => {
    expect(
      withoutPrivate({
        title: 'Gala',
        teams,
        overrides: { 'g_2026-11-20': { startTime: '7 PM', carpoolCars: [] } },
      })
    ).toEqual({ title: 'Gala', overrides: { 'g_2026-11-20': { startTime: '7 PM' } } })
  })
})

describe('who may read them', () => {
  it('is everyone on it, on any of its dates: named, in a group, or on a team', () => {
    expect(
      eventAccess(
        {
          users: ['me', 7],
          groups: ['g1', 'gone'],
          teams,
          overrides: { 'x_2026-11-01': { users: ['guest'] }, 'x_2026-11-08': { deleted: true } },
        },
        groups
      )
    ).toEqual(['7', 'ann', 'bo', 'guest', 'lee', 'me', 'sam'])
    expect(eventAccess({ title: 'Nobody yet' }, groups)).toEqual([])
  })

  it('is compared as kept: sorted, and nothing else', () => {
    expect(sameAccess(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameAccess(['b', 'a'], ['a', 'b'])).toBe(false)
    expect(sameAccess(undefined, [])).toBe(false)
  })
})

describe('details left in the event, moved across', () => {
  it('moves them, and clears them from the event — a date’s too', () => {
    const { moved, cleared } = strays({
      title: 'Gala',
      teams,
      overrides: {
        'g_2026-11-20': { startTime: '7 PM', dressCode: [{ group: 'All', text: 'Red' }] },
      },
    })
    expect(moved).toEqual({
      teams,
      overrides: { 'g_2026-11-20': { dressCode: [{ group: 'All', text: 'Red' }] } },
    })
    expect(cleared).toEqual([['teams'], ['overrides', 'g_2026-11-20', 'dressCode']])
  })

  it('never lets an empty one — saved by an app that can no longer see them — wipe a set one', () => {
    const closed = {
      teams,
      schedule: [{ id: '1', time: '5 PM', title: 'Doors' }],
      overrides: { 'g_2026-11-27': { carpoolCars: [{ id: 'c' }] } },
    }
    const { moved, cleared } = strays(
      {
        teams: [],
        schedule: [],
        rtp: '',
        dcw: 'All black',
        overrides: {
          // That date's own cars, and — for a date with none — the event's teams.
          'g_2026-11-27': { carpoolCars: [] },
          'g_2026-12-04': { teams: [] },
        },
      },
      closed
    )
    // What is set stays; a blank where nothing was set is still moved (it clears nothing).
    expect(moved).toEqual({ rtp: '', dcw: 'All black' })
    // Cleared from the event all the same: they don't belong there.
    expect(cleared).toHaveLength(6)
    expect(withMoved(closed, moved)).toEqual({ ...closed, rtp: '', dcw: 'All black' })
  })

  it('keeps a date’s other changes when one is moved into it', () => {
    expect(
      withMoved(
        { overrides: { k: { teams } }, access: ['x'] },
        { overrides: { k: { dressCode: [] } } }
      )
    ).toEqual({ overrides: { k: { teams, dressCode: [] } }, access: ['x'] })
  })
})

describe('who may see an event at all', () => {
  it('is everyone, for a public one — or one with a public date', () => {
    expect(eventSeenBy({ isPublic: true, users: ['me'] }, groups)).toEqual([EVERYONE])
    expect(
      eventSeenBy({ isPublic: false, overrides: { 'x_2026-11-01': { isPublic: true } } }, groups)
    ).toEqual([EVERYONE])
    // A public date that was cancelled doesn't count.
    expect(
      eventSeenBy(
        { users: ['me'], overrides: { 'x_2026-11-01': { isPublic: true, deleted: true } } },
        groups
      )
    ).toEqual(['me'])
  })

  it('is only those on it, for one that isn’t', () => {
    expect(eventSeenBy({ isPublic: false, users: ['me'], groups: ['g1'], teams }, groups)).toEqual([
      'ann',
      'bo',
      'lee',
      'me',
      'sam',
    ])
    expect(eventSeenBy({ title: 'Nobody yet' }, groups)).toEqual([])
  })

  it('is no one, for a draft — admins see every event regardless', () => {
    expect(eventSeenBy({ isPublic: true, unpublished: true, users: ['me'] }, groups)).toEqual([])
  })
})

describe('the digest email', () => {
  const events = [
    { title: 'Sunday', date: '2026-11-01', seenBy: [EVERYONE] },
    { title: 'Staff retreat', date: '2026-11-02', seenBy: ['sam'] },
    { title: 'Draft', date: '2026-11-03', unpublished: true, seenBy: [] },
    // Not yet told who may see it: public or not.
    { title: 'Older', date: '2026-11-04', isPublic: false },
    { title: 'Older public', date: '2026-11-05', isPublic: true },
  ]
  const titles = (uid: string, roles: string[]) =>
    digestEventsFor(events, { uid, roles }).map((e) => e.title)

  it('lists only the events each person may see', () => {
    expect(titles('ann', ['regular'])).toEqual(['Sunday', 'Older public'])
    expect(titles('sam', ['regular'])).toEqual(['Sunday', 'Staff retreat', 'Older public'])
    expect(titles('pub', ['public'])).toEqual(['Sunday', 'Older public'])
    // An admin: all but drafts.
    expect(titles('boss', ['admin'])).toEqual(['Sunday', 'Staff retreat', 'Older', 'Older public'])
  })
})
