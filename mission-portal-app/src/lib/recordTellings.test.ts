import { describe, it, expect } from 'vitest'
import {
  answersToTell,
  availKeyParts,
  draftAccess,
  eventTellings,
  FRESH_ANSWER_MS,
  justReported,
  justResolved,
  newIncidentSaid,
  newlyGiven,
  peopleIn,
  taskTellings,
} from '../../functions/src/push/recordTellings'
import { ADMINS, SETTLED_QUIETLY } from '../../functions/src/eventPrivate'

/**
 * Who the server tells, of what, when a record changes — what the app used
 * to ask for itself, through a function anyone signed in could call.
 */

describe('a task', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    title: 'Pack the van',
    assignees: ['u1', 'u2'],
    by: 'boss',
    status: 'pending',
    ...over,
  })

  it('tells each assignee when it is made', () => {
    expect(taskTellings(undefined, task(), '7')).toEqual([
      { to: 'u1', type: 'newAssignment', data: { taskId: '7', taskTitle: 'Pack the van' } },
      { to: 'u2', type: 'newAssignment', data: { taskId: '7', taskTitle: 'Pack the van' } },
    ])
  })

  it('tells only those it is newly given to, when it is changed', () => {
    const out = taskTellings(task({ assignees: ['u1'] }), task({ assignees: ['u1', 'u3'] }), '7')
    expect(out.map((t) => t.to)).toEqual(['u3'])
  })

  it('says nothing when only who may read it is written (the server’s own stamp)', () => {
    expect(taskTellings(task(), task({ seenBy: ['u1', 'u2', ADMINS] }), '7')).toEqual([])
  })

  it('calls an issue’s corrective action what it is, without the tag on its title', () => {
    const out = taskTellings(
      undefined,
      task({
        title: '[Issue #12] Replace the cable',
        assignees: ['u1'],
        taskType: 'issue_corrective',
        issueId: 12,
      }),
      '8'
    )
    expect(out).toEqual([
      {
        to: 'u1',
        type: 'issueAssigned',
        data: { title: 'Replace the cable', issueId: '12', taskId: '8' },
      },
    ])
  })

  it('leaves a reimbursement’s, a meeting request’s and a set list’s to their own steps', () => {
    for (const taskType of ['reimbursement', 'meeting_request', 'worship_setlist_ack']) {
      expect(taskTellings(undefined, task({ taskType }), '9')).toEqual([])
    }
  })

  it('tells whoever made it when someone else finishes it', () => {
    const out = taskTellings(task(), task({ status: 'done', doneBy: 'u1' }), '7')
    expect(out).toEqual([
      { to: 'boss', type: 'taskComplete', data: { taskId: '7', taskTitle: 'Pack the van' } },
    ])
  })

  it('does not tell them when they finished it themselves', () => {
    expect(taskTellings(task(), task({ status: 'done', doneBy: 'boss' }), '7')).toEqual([])
  })

  it('from an app that doesn’t say who finished it: tells them unless it was theirs alone', () => {
    expect(taskTellings(task(), task({ status: 'done' }), '7')).toHaveLength(1)
    const own = task({ assignees: ['boss'] })
    expect(taskTellings(own, { ...own, status: 'done' }, '7')).toEqual([])
  })

  it('says nothing of a finished task written again', () => {
    const done = task({ status: 'done', doneBy: 'u1' })
    expect(taskTellings(done, { ...done, overdueNotified: true }, '7')).toEqual([])
  })

  it('is quiet when a verification or a set list acknowledgement is finished', () => {
    for (const taskType of ['kaizen_verification', 'worship_setlist_ack', 'reimbursement']) {
      const t = task({ taskType })
      expect(
        taskTellings(t, { ...t, status: 'done', doneBy: 'u1' }, '7').filter(
          (x) => x.type === 'taskComplete'
        )
      ).toEqual([])
    }
  })

  it('tells every admin when it falls behind, once', () => {
    const out = taskTellings(task(), task({ status: 'behind' }), '7')
    expect(out).toEqual([
      { to: ADMINS, type: 'eventHealthBehind', data: { taskId: '7', taskTitle: 'Pack the van' } },
    ])
    const behind = task({ status: 'behind' })
    expect(taskTellings(behind, { ...behind, projectedDate: '2026-12-01' }, '7')).toEqual([])
  })
})

describe('what people are given on an event', () => {
  const hotel = (assignees: string[]) => ({
    lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '12', assignees }],
  })
  const plain = (out: ReturnType<typeof newlyGiven>) =>
    out.map(({ uid, itemLabel }) => ({ uid, itemLabel }))

  it('is all new on a brand new event', () => {
    expect(newlyGiven(null, hotel(['u1']))).toEqual([
      { uid: 'u1', itemLabel: 'Ibis, room 12', dateKey: '' },
    ])
  })

  it('is nothing when a save changed none of it', () => {
    // The whole point: an event gets saved repeatedly and must not
    // re-announce the same hotel room every time.
    expect(newlyGiven(hotel(['u1']), hotel(['u1']))).toEqual([])
  })

  it('is only the person newly added', () => {
    expect(plain(newlyGiven(hotel(['u1']), hotel(['u1', 'u2'])))).toEqual([
      { uid: 'u2', itemLabel: 'Ibis, room 12' },
    ])
  })

  it('is a room change, to someone already on the booking', () => {
    const before = { lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '12', assignees: ['u1'] }] }
    const after = { lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '34', assignees: ['u1'] }] }
    expect(plain(newlyGiven(before, after))).toEqual([{ uid: 'u1', itemLabel: 'Ibis, room 34' }])
  })

  it('is nothing when someone is taken off', () => {
    expect(newlyGiven(hotel(['u1', 'u2']), hotel(['u1']))).toEqual([])
  })

  it('covers flights, naming the airline when there is one', () => {
    const named = { flightEntries: [{ id: 'f1', uid: 'u1', outAirline: 'BA', outFlight: '117' }] }
    expect(plain(newlyGiven(null, named))).toEqual([{ uid: 'u1', itemLabel: 'BA 117' }])
    expect(plain(newlyGiven(null, { flightEntries: [{ id: 'f1', uid: 'u1' }] }))).toEqual([
      { uid: 'u1', itemLabel: 'A flight' },
    ])
  })

  it('covers a carpool’s driver and riders, and not an empty driver’s seat', () => {
    const out = newlyGiven(null, {
      carpoolCars: [
        { id: 'c1', label: 'Van', driver: 'u1', riders: ['u2', 'u3'] },
        { id: 'c2', label: 'Truck', driver: '', riders: [] },
      ],
    })
    expect(out.map((a) => a.uid).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(out.every((a) => a.itemLabel === 'Carpool: Van')).toBe(true)
  })

  it('gives one person two entries for two different things', () => {
    const out = newlyGiven(null, {
      ...hotel(['u1']),
      flightEntries: [{ id: 'f1', uid: 'u1', outAirline: 'BA', outFlight: '117' }],
    })
    expect(out).toHaveLength(2)
  })

  it('is nothing for a date first changed for another reason, which copies the event’s across', () => {
    const before = hotel(['u1'])
    const after = { ...hotel(['u1']), overrides: { e1_2026_03_02: hotel(['u1']) } }
    expect(newlyGiven(before, after)).toEqual([])
  })

  it('is what one date was given apart from the rest, with that date', () => {
    const before = hotel(['u1'])
    const after = { ...hotel(['u1']), overrides: { 'e1_2026-03-02': hotel(['u1', 'u2']) } }
    expect(newlyGiven(before, after)).toEqual([
      { uid: 'u2', itemLabel: 'Ibis, room 12', dateKey: 'e1_2026-03-02' },
    ])
  })
})

describe('an event’s private record written', () => {
  const published = (people: string[], rest: Record<string, unknown> = {}) => ({
    access: [...people, ADMINS],
    ...rest,
  })
  const draft = (maker: string, rest: Record<string, unknown> = {}) => ({
    access: [maker],
    ...rest,
  })

  it('knows a draft’s access from a published event’s', () => {
    expect(draftAccess(['maker'])).toBe(true)
    expect(draftAccess([ADMINS])).toBe(true)
    expect(draftAccess(['u1', ADMINS])).toBe(false)
    expect(peopleIn(['u1', ADMINS])).toEqual(['u1'])
  })

  it('tells those put on it and those taken off', () => {
    const out = eventTellings(published(['u1', 'u2']), published(['u2', 'u3']))
    expect(out).toEqual({ joined: ['u3'], removed: ['u1'], given: [] })
  })

  it('tells no one of a draft, made or saved', () => {
    const none = { joined: [], removed: [], given: [] }
    expect(eventTellings(undefined, draft('maker'))).toEqual(none)
    expect(eventTellings(draft('maker'), draft('maker', { carpoolCars: [] }))).toEqual(none)
    // Taken back to a draft: nobody is told they were removed.
    expect(eventTellings(published(['u1']), draft('maker'))).toEqual(none)
  })

  it('tells everyone on it when it is published, and of all they were given', () => {
    const cars = { carpoolCars: [{ id: 'c1', label: 'Van', driver: 'u1', riders: [] }] }
    const out = eventTellings(draft('maker', cars), published(['maker', 'u1'], cars))
    expect(out.joined).toEqual(['maker', 'u1'])
    expect(out.removed).toEqual([])
    expect(out.given.map((g) => g.uid)).toEqual(['u1'])
  })

  it('made already published: tells those given something, and nobody that they were added', () => {
    const cars = { carpoolCars: [{ id: 'c1', label: 'Van', driver: 'u1', riders: [] }] }
    const out = eventTellings(undefined, published(['u1', 'u2'], cars))
    expect(out.joined).toEqual([])
    expect(out.given).toHaveLength(1)
  })

  it('tells no one they were added or removed when a group’s members changed', () => {
    const out = eventTellings(
      published(['u1'], { [SETTLED_QUIETLY]: 2 }),
      published(['u2', 'u3'], { [SETTLED_QUIETLY]: 3 })
    )
    expect(out).toEqual({ joined: [], removed: [], given: [] })
  })

  it('tells no one when it is deleted', () => {
    expect(eventTellings(published(['u1']), undefined)).toEqual({
      joined: [],
      removed: [],
      given: [],
    })
  })
})

describe('an availability answer', () => {
  const now = 1_800_000_000_000
  const said = (status: string, ts = now) => ({ status, note: '', ts })

  it('is news when it is anything but Available, given first or changed', () => {
    const out = answersToTell(
      { responses: { u1: said('yes'), u3: said('no') } },
      { responses: { u1: said('no'), u2: said('partial'), u3: said('no'), u4: said('yes') } },
      now
    )
    expect(out).toEqual([
      { uid: 'u1', statusLabel: 'not available' },
      { uid: 'u2', statusLabel: 'partial' },
    ])
  })

  it('is not news when taken back, or when only who may see it is written', () => {
    const before = { responses: { u1: said('no') } }
    expect(answersToTell(before, { responses: { u1: null } }, now)).toEqual([])
    expect(answersToTell(before, { ...before, seenBy: ['u1', ADMINS] }, now)).toEqual([])
  })

  it('is not news when an old one is put back, as a lifted block does', () => {
    const old = said('tbd', now - FRESH_ANSWER_MS - 1)
    expect(
      answersToTell({ responses: { u1: said('no') } }, { responses: { u1: old } }, now)
    ).toEqual([])
  })

  it('names its event and date apart', () => {
    expect(availKeyParts('12_2026-11-20')).toEqual({ eventId: '12', date: '2026-11-20' })
    expect(availKeyParts('12_2026-11-21_d2')).toEqual({ eventId: '12', date: '2026-11-21' })
    expect(availKeyParts('12_series')).toEqual({ eventId: '12', date: '' })
    expect(availKeyParts('nothing')).toBeNull()
  })
})

describe('security, conversations and reports', () => {
  it('says where a new incident is, and the start of what it is', () => {
    expect(newIncidentSaid({ location: 'North door', description: 'Someone fell' })).toBe(
      '🚨 New incident at North door: Someone fell'
    )
    expect(newIncidentSaid({ location: '', description: 'x'.repeat(100) })).toBe(
      `🚨 New incident at an unknown location: ${'x'.repeat(80)}…`
    )
  })

  it('knows a conversation just reported from one reported before', () => {
    expect(justReported({ reported: false }, { reported: true })).toBe(true)
    expect(justReported({}, { reported: true })).toBe(true)
    expect(justReported({ reported: true }, { reported: true })).toBe(false)
    expect(justReported({ reported: true }, { reported: false })).toBe(false)
  })

  it('knows a report just dealt with from one dealt with before', () => {
    expect(justResolved({ status: 'open' }, { status: 'actioned' })).toBe(true)
    expect(justResolved({ status: 'open' }, { status: 'dismissed' })).toBe(true)
    expect(justResolved({ status: 'actioned' }, { status: 'dismissed' })).toBe(false)
    expect(justResolved({ status: 'open' }, { status: 'open' })).toBe(false)
  })
})
