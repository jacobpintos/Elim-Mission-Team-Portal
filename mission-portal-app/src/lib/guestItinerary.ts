import { sameId } from '@/lib/ids'
import type { EventInstance, LodgingEntry, FlightEntry } from '@/types/events'

/**
 * What a guest needs at a glance: where they are sleeping, when they are
 * flying, and the set list if they are singing.
 *
 * Kept as pure functions so the matching rules — which are fiddlier than they
 * look — can be tested without standing up a screen.
 */

export interface GuestLodging {
  event: EventInstance
  entry: LodgingEntry
}

export interface GuestFlight {
  event: EventInstance
  entry: FlightEntry
}

/** Hotel rows across the given events that list this user. */
export function guestLodging(events: EventInstance[], uid: string): GuestLodging[] {
  const out: GuestLodging[] = []
  for (const event of events) {
    for (const entry of event.lodgingEntries ?? []) {
      if ((entry.assignees ?? []).some((a) => sameId(a, uid))) out.push({ event, entry })
    }
  }
  return out
}

/** Flight rows across the given events belonging to this user. */
export function guestFlights(events: EventInstance[], uid: string): GuestFlight[] {
  const out: GuestFlight[] = []
  for (const event of events) {
    for (const entry of event.flightEntries ?? []) {
      if (sameId(entry.uid, uid)) out.push({ event, entry })
    }
  }
  return out
}

/**
 * Is this user on a team whose name mentions worship?
 *
 * Matched case-insensitively and as a substring, so "Worship", "worship team"
 * and "Sunday Worship Band" all count — team names are typed by hand and vary
 * between events.
 */
export function onWorshipTeam(event: EventInstance, uid: string): boolean {
  return (event.teams ?? []).some((team) => {
    if (!/worship/i.test(team.name ?? '')) return false
    return (
      (team.members ?? []).some((m) => sameId(m, uid)) ||
      (team.leaders ?? []).some((l) => sameId(l, uid))
    )
  })
}

/** Events where this user is on a worship team, so a set list is relevant. */
export function worshipEventsFor(events: EventInstance[], uid: string): EventInstance[] {
  return events.filter((event) => onWorshipTeam(event, uid))
}
