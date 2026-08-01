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

/**
 * Everything a person can be handed on an event, flattened to uid + label.
 *
 * Food is deliberately absent: foodItems is a plain list of strings on the
 * event with no assignee field, so there is nobody to notify. Making food
 * assignable is a data-model change, not a notification one.
 */
function logisticsFor(event: {
  lodgingEntries?: LodgingEntry[]
  flightEntries?: FlightEntry[]
  carpoolCars?: { id: string; label?: string; driver?: string; riders?: string[] }[]
}): Map<string, string> {
  // Keyed by "uid|label" so the same person getting two different things
  // produces two entries, but the same thing twice produces one.
  const out = new Map<string, string>()
  const add = (uid: unknown, label: string) => {
    if (uid === undefined || uid === null || uid === '') return
    out.set(`${String(uid)}|${label}`, label)
  }

  for (const l of event.lodgingEntries ?? []) {
    const label = l.room ? `${l.name}, room ${l.room}` : l.name
    ;(l.assignees ?? []).forEach((a) => add(a, label))
  }
  for (const f of event.flightEntries ?? []) {
    add(f.uid, [f.outAirline, f.outFlight].filter(Boolean).join(' ') || 'A flight')
  }
  for (const c of event.carpoolCars ?? []) {
    const label = c.label ? `Carpool: ${c.label}` : 'A carpool seat'
    add(c.driver, label)
    ;(c.riders ?? []).forEach((r) => add(r, label))
  }
  return out
}

/**
 * Which travel assignments are new since the previous version of an event.
 *
 * An event is edited many times; without this every save would re-announce
 * every hotel room on it.
 */
export function newLogisticsAssignments(
  previous: Parameters<typeof logisticsFor>[0] | null | undefined,
  next: Parameters<typeof logisticsFor>[0]
): { uid: string; itemLabel: string }[] {
  const before = previous ? logisticsFor(previous) : new Map<string, string>()
  const after = logisticsFor(next)
  const added: { uid: string; itemLabel: string }[] = []
  for (const [key, itemLabel] of after) {
    if (before.has(key)) continue
    added.push({ uid: key.split('|')[0], itemLabel })
  }
  return added
}
