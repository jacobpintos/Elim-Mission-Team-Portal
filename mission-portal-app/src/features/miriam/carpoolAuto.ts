import { useGroupsStore } from '@/stores/groupsStore'
import { useUsersStore } from '@/stores/usersStore'
import { sameId } from '@/lib/ids'
import type { EventDraft } from '@/lib/miriam'
import { readCarpoolMemory } from '@/lib/carpoolMemoryDb'
import { seatsRemembered, togetherCounts, type CarpoolMemory } from '@/lib/carpoolMemory'
import {
  autoAssign,
  driverToPick,
  familyName,
  type AssignCar,
} from '@/features/events/carpoolAssign'
import { customSeatingRules } from '@/custom/carpool'
import type { CarpoolCarData } from '@/types/events'

/**
 * Carpools Miriam is asked for with the cars that are going — "Andy's van
 * and Sam's truck, Andy and Sam driving" — filled in here, as the carpool
 * builder's Auto-assign fills them (features/events/carpoolAssign): with the
 * cars' sizes as remembered where none was said, and who has ridden together
 * before (lib/carpoolMemory).
 */

/** Who each is, for keeping men with men and women with women. */
function peopleOf(uids: string[]) {
  const users = useUsersStore.getState().users
  return uids.map((uid) => {
    const u = users.find((x) => sameId(x.uid, uid))
    return { uid, sex: u?.sex, family: familyName(u?.displayName) }
  })
}

/** Everyone on an event: those assigned one by one, and the members of its groups. */
export function onTheEvent(users: string[], groups: string[]): string[] {
  const members = useGroupsStore.getState().getMemberUids(groups)
  return [...new Set([...users.map(String), ...members.map(String)])]
}

/** What doesn't fit, said as she notes it. */
export function noRoomSaid(noRoom: string[]): string {
  const users = useUsersStore.getState().users
  const names = noRoom.map((uid) => users.find((u) => sameId(u.uid, uid))?.displayName ?? 'Someone')
  return `${names.length === 1 ? `${names[0]} didn’t` : `${names.join(', ')} didn’t`} fit in the cars — add a car or seats, or put them in by hand.`
}

/** Cars as said, ready to be filled: each one's size said, else as remembered. */
function toAssign(cars: Omit<CarpoolCarData, 'id'>[], memory: CarpoolMemory): AssignCar[] {
  return cars.map((c, i) => ({
    id: `${Date.now().toString(36)}_${i}`,
    label: c.label,
    seats: c.seats || seatsRemembered(memory, c.label) || 0,
    driver: c.driver,
    children: c.children,
  }))
}

/** Riders put in the cars of `cars`, for everyone in `people` but those not riding. */
export async function fillCars(
  cars: Omit<CarpoolCarData, 'id'>[],
  people: string[],
  notRiding: string[] = [],
  /** The event and date, as its cars are remembered: its own last arrangement isn't another time. */
  rideKey?: string
): Promise<{ cars: CarpoolCarData[]; noRoom: string[] }> {
  const [memory, rules] = await Promise.all([readCarpoolMemory(), customSeatingRules()])
  return autoAssign({
    cars: toAssign(cars, memory),
    people: peopleOf(people),
    leftOut: notRiding,
    together: togetherCounts(memory, rideKey),
    rules,
    seed: Date.now() % 2147483647,
  })
}

/**
 * A form she filled in whose cars' riders are left to the app: filled, for
 * everyone the form has on the event — what it said, else (`onScreen`) the
 * form on the screen as it is.
 */
export async function withCarsFilled(
  draft: EventDraft,
  onScreen?: { users: string[]; groups: string[] } | null
): Promise<{ draft: EventDraft; notes: string[] }> {
  if (!draft.carsAuto || !draft.cars?.length) return { draft, notes: [] }
  const users = draft.users ?? onScreen?.users ?? []
  const groups = draft.groups ?? onScreen?.groups ?? []
  const filled = await fillCars(
    draft.cars.map((c, i) => ({
      ...c,
      children: (c.children ?? []).map((name, j) => ({ id: `${i}_${j}`, name })),
    })),
    onTheEvent(users, groups),
    draft.notRiding
  )
  return {
    draft: {
      ...draft,
      cars: filled.cars.map((c) => ({
        label: c.label,
        ...(c.seats ? { seats: c.seats } : {}),
        driver: c.driver,
        riders: c.riders,
        ...(c.children?.length ? { children: c.children.map((k) => k.name) } : {}),
      })),
    },
    notes: [
      ...(filled.noRoom.length ? [noRoomSaid(filled.noRoom)] : []),
      ...(driverToPick(filled.cars) ? [driverToPick(filled.cars)] : []),
    ],
  }
}
