import { describe, it, expect } from 'vitest'
import {
  guestLodging,
  guestFlights,
  onWorshipTeam,
  worshipEventsFor,
  newLogisticsAssignments,
} from './guestItinerary'
import type { EventInstance } from '@/types/events'

const ev = (over: Partial<EventInstance> = {}) =>
  ({ id: 'e1', instanceKey: 'e1_x', date: '2026-03-02', title: 'Trip', ...over }) as EventInstance

describe('guestLodging', () => {
  it('finds the rows this user is assigned to', () => {
    const e = ev({
      lodgingEntries: [
        { id: 'l1', name: 'Hotel A', room: '101', assignees: ['u1'] },
        { id: 'l2', name: 'Hotel B', room: '202', assignees: ['u2'] },
      ],
    })

    const out = guestLodging([e], 'u1')

    expect(out).toHaveLength(1)
    expect(out[0].entry.name).toBe('Hotel A')
    // The event comes back too, since the card needs to say which trip.
    expect(out[0].event.id).toBe('e1')
  })

  it('matches an assignee stored as a number', () => {
    const e = ev({ lodgingEntries: [{ id: 'l1', name: 'H', assignees: [7 as never] }] })

    expect(guestLodging([e], '7')).toHaveLength(1)
  })

  it('copes with events that have no lodging at all', () => {
    expect(guestLodging([ev()], 'u1')).toEqual([])
    expect(guestLodging([ev({ lodgingEntries: [] })], 'u1')).toEqual([])
  })

  it('returns a row from each event a user is booked into', () => {
    const a = ev({ id: 'a', lodgingEntries: [{ id: 'l1', name: 'A', assignees: ['u1'] }] })
    const b = ev({ id: 'b', lodgingEntries: [{ id: 'l2', name: 'B', assignees: ['u1'] }] })

    expect(guestLodging([a, b], 'u1')).toHaveLength(2)
  })
})

describe('guestFlights', () => {
  it('finds only this user flights', () => {
    const e = ev({
      flightEntries: [
        { id: 'f1', uid: 'u1', outAirline: 'AA' },
        { id: 'f2', uid: 'u2', outAirline: 'BB' },
      ],
    })

    const out = guestFlights([e], 'u1')

    expect(out).toHaveLength(1)
    expect(out[0].entry.outAirline).toBe('AA')
  })

  it('matches a uid stored as a number', () => {
    const e = ev({ flightEntries: [{ id: 'f1', uid: 7 as never }] })

    expect(guestFlights([e], '7')).toHaveLength(1)
  })

  it('copes with events that have no flights', () => {
    expect(guestFlights([ev()], 'u1')).toEqual([])
  })
})

describe('onWorshipTeam', () => {
  const team = (name: string, members: string[] = ['u1']) => ({ name, members, leaders: [] })

  it('matches regardless of capitalisation', () => {
    // Team names are typed by hand and vary between events.
    for (const name of ['Worship', 'worship', 'WORSHIP', 'WoRsHiP']) {
      expect(onWorshipTeam(ev({ teams: [team(name)] }), 'u1')).toBe(true)
    }
  })

  it('matches when worship is part of a longer name', () => {
    expect(onWorshipTeam(ev({ teams: [team('Sunday Worship Band')] }), 'u1')).toBe(true)
    expect(onWorshipTeam(ev({ teams: [team('Worship Team')] }), 'u1')).toBe(true)
  })

  it('does not match an unrelated team', () => {
    expect(onWorshipTeam(ev({ teams: [team('Production')] }), 'u1')).toBe(false)
  })

  it('does not match a worship team this user is not on', () => {
    expect(onWorshipTeam(ev({ teams: [team('Worship', ['u2'])] }), 'u1')).toBe(false)
  })

  it('counts leading a worship team, not just being in it', () => {
    const e = ev({ teams: [{ name: 'Worship', members: [], leaders: ['u1'] }] })

    expect(onWorshipTeam(e, 'u1')).toBe(true)
  })

  it('copes with an event that has no teams', () => {
    expect(onWorshipTeam(ev(), 'u1')).toBe(false)
    expect(onWorshipTeam(ev({ teams: [] }), 'u1')).toBe(false)
  })
})

describe('worshipEventsFor', () => {
  it('keeps only the events where the user is on a worship team', () => {
    const a = ev({ id: 'a', teams: [{ name: 'Worship', members: ['u1'], leaders: [] }] })
    const b = ev({ id: 'b', teams: [{ name: 'Setup', members: ['u1'], leaders: [] }] })

    expect(worshipEventsFor([a, b], 'u1').map((e) => e.id)).toEqual(['a'])
  })
})

describe('newLogisticsAssignments', () => {
  const hotel = (assignees: string[]) => ({
    lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '12', assignees }],
  })

  it('announces everything on a brand new event', () => {
    const out = newLogisticsAssignments(null, hotel(['u1']))

    expect(out).toEqual([{ uid: 'u1', itemLabel: 'Ibis, room 12' }])
  })

  it('says nothing when an edit changed none of it', () => {
    // The whole point: an event gets saved repeatedly and must not
    // re-announce the same hotel room every time.
    expect(newLogisticsAssignments(hotel(['u1']), hotel(['u1']))).toEqual([])
  })

  it('announces only the person newly added', () => {
    const out = newLogisticsAssignments(hotel(['u1']), hotel(['u1', 'u2']))

    expect(out).toEqual([{ uid: 'u2', itemLabel: 'Ibis, room 12' }])
  })

  it('announces a room change to someone already on the booking', () => {
    const before = { lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '12', assignees: ['u1'] }] }
    const after = { lodgingEntries: [{ id: 'l1', name: 'Ibis', room: '34', assignees: ['u1'] }] }

    expect(newLogisticsAssignments(before, after)).toEqual([
      { uid: 'u1', itemLabel: 'Ibis, room 34' },
    ])
  })

  it('says nothing when someone is removed', () => {
    // Removal is not an assignment; there is nothing to announce to them.
    expect(newLogisticsAssignments(hotel(['u1', 'u2']), hotel(['u1']))).toEqual([])
  })

  it('covers flights, and names the airline when there is one', () => {
    const out = newLogisticsAssignments(null, {
      flightEntries: [{ id: 'f1', uid: 'u1', outAirline: 'BA', outFlight: '117' }],
    })

    expect(out).toEqual([{ uid: 'u1', itemLabel: 'BA 117' }])
  })

  it('falls back to a generic flight label when the airline is blank', () => {
    const out = newLogisticsAssignments(null, { flightEntries: [{ id: 'f1', uid: 'u1' }] })

    expect(out).toEqual([{ uid: 'u1', itemLabel: 'A flight' }])
  })

  it('covers both the driver and the riders of a carpool', () => {
    const out = newLogisticsAssignments(null, {
      carpoolCars: [{ id: 'c1', label: 'Van', driver: 'u1', riders: ['u2', 'u3'] }],
    })

    expect(out.map((a) => a.uid).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(out.every((a) => a.itemLabel === 'Carpool: Van')).toBe(true)
  })

  it('ignores an empty driver slot', () => {
    const out = newLogisticsAssignments(null, {
      carpoolCars: [{ id: 'c1', label: 'Van', driver: '', riders: [] }],
    })

    expect(out).toEqual([])
  })

  it('gives one person two entries when they get two different things', () => {
    const out = newLogisticsAssignments(null, {
      ...hotel(['u1']),
      flightEntries: [{ id: 'f1', uid: 'u1', outAirline: 'BA', outFlight: '117' }],
    })

    expect(out).toHaveLength(2)
  })
})

/**
 * Mirror of the food reminder's open-item rule. functions/ builds separately
 * and is not compiled by this runner, so the rule is pinned here.
 */
function openItemIndexes(items: string[], signups: Record<string, unknown> | undefined): number[] {
  return items
    .map((label, i) => ({ label, i }))
    .filter(({ label, i }) => label.trim() !== '' && !signups?.[String(i)])
    .map(({ i }) => i)
}

describe('openItemIndexes', () => {
  it('lists items nobody has claimed', () => {
    expect(openItemIndexes(['Salad', 'Bread'], {})).toEqual([0, 1])
  })

  it('drops items that are taken', () => {
    expect(openItemIndexes(['Salad', 'Bread'], { '0': { uid: 'u1' } })).toEqual([1])
  })

  it('ignores blank rows', () => {
    // The form seeds a new event with one empty item, and an empty string is
    // not something anyone can bring.
    expect(openItemIndexes(['Salad', '', '   '], {})).toEqual([0])
  })

  it('returns nothing when everything is claimed, so no nudge is sent', () => {
    const signups = { '0': { uid: 'u1' }, '1': { uid: 'u2' } }

    expect(openItemIndexes(['Salad', 'Bread'], signups)).toEqual([])
  })

  it('copes with no signup doc at all', () => {
    expect(openItemIndexes(['Salad'], undefined)).toEqual([0])
  })
})
