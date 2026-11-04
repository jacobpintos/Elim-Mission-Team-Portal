import type { UserProfile } from '@/types/user'
import { isAdmin } from '@/lib/roles'
import { useUsersStore } from '@/stores/usersStore'
import type { Prepared } from '@/features/miriam/actions'
import { ELIM_VAN_ID } from './vehicles/elimVan'
import { TRAILER_LABELS, type TrailerAbility, type Vehicle } from './vehicles/types'
import { newVehicleId, readVehicles, useVehiclesStore } from './vehicles/vehiclesStore'

/**
 * Custom: The Well. Miriam and the team's vehicles (functions/src/miriam/plan:
 * read_vehicles, add_vehicle, update_vehicle, remove_vehicle) — for admins,
 * each change shown to confirm first, with Undo, as her others are
 * (features/miriam/actions).
 */

const cannot = (message: string): Prepared => ({ kind: 'cannot', message })
const nameOf = (uid: string) =>
  useUsersStore.getState().users.find((u) => String(u.uid) === uid)?.displayName ?? 'someone'
const known = (ids: unknown): string[] => {
  const people = new Set(useUsersStore.getState().users.map((u) => String(u.uid)))
  return (Array.isArray(ids) ? ids.map(String) : []).filter((id) => people.has(id))
}
const trailerOf = (v: unknown): TrailerAbility | null =>
  v === 'none' || v === 'small' || v === 'both' ? v : null
/** "yes" or "no" as said; null to leave it. */
const yesNo = (v: unknown): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
const seatsOf = (v: unknown): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : 0
}

/** A vehicle, said in a line: "Andy’s Odyssey · 7 seats · Small trailer only · Andy Cole, Tom Reyes". */
export function vehicleLine(v: Vehicle): string {
  const drivers = v.anyDriver
    ? `anyone who drives another vehicle${v.drivers.length ? `, and ${v.drivers.map(nameOf).join(', ')}` : ''}`
    : v.drivers.length
      ? v.drivers.map(nameOf).join(', ')
      : 'no drivers yet'
  const how = [v.mixedSex ? 'men and women together' : '', v.fillFirst ? 'filled first' : '']
    .filter(Boolean)
    .join(', ')
  return `${v.name} · ${v.seats} seats · ${TRAILER_LABELS[v.trailer]}${how ? ` · ${how}` : ''} · Drivers: ${drivers}`
}

/** The vehicle named, as said: its name in full, or the only one whose name has those words. */
function vehicleNamed(vehicles: Vehicle[], said: string): Vehicle | Vehicle[] | null {
  const s = said.trim().toLowerCase().replace(/[’]/g, "'")
  if (!s) return null
  const norm = (v: Vehicle) => v.name.toLowerCase().replace(/[’]/g, "'")
  const exact = vehicles.find((v) => norm(v) === s)
  if (exact) return exact
  const words = s.split(/\s+/).filter((w) => w.length > 1 && w !== 'the')
  const fits = vehicles.filter((v) => words.every((w) => norm(v).includes(w)))
  return fits.length === 1 ? fits[0] : fits.length ? fits : null
}

/** read_vehicles: the list, as Miriam reads it. */
export async function vehiclesForMiriam() {
  const vehicles = await readVehicles()
  return {
    vehicles: vehicles.map((v) => ({
      name: v.name,
      seats: v.seats,
      trailer: v.trailer,
      drivers: v.anyDriver
        ? ['anyone who may drive another vehicle', ...v.drivers.map(nameOf)]
        : v.drivers.map(nameOf),
      asked_each_time: !!v.ask,
      men_and_women_together: !!v.mixedSex,
      filled_first: !!v.fillFirst,
      ...(v.notes ? { notes: v.notes } : {}),
    })),
  }
}

export async function addVehicle(profile: UserProfile, input: Record<string, unknown>) {
  if (!isAdmin(profile)) return cannot('Only admins can do that.')
  const name = String(input.name ?? '').trim()
  if (!name) return cannot('A vehicle needs a name.')
  const vehicles = await readVehicles()
  const same = vehicleNamed(vehicles, name)
  if (same && !Array.isArray(same) && same.name.toLowerCase() === name.toLowerCase()) {
    return cannot(`There’s already a vehicle called ${same.name}.`)
  }
  const seats = seatsOf(input.seats)
  const vehicle: Vehicle = {
    id: newVehicleId(
      name,
      vehicles.map((v) => v.id)
    ),
    name,
    seats: seats || 5,
    drivers: known(input.driver_ids),
    trailer: trailerOf(input.trailer) ?? 'none',
    ...(yesNo(input.men_and_women_together) ? { mixedSex: true } : {}),
    ...(yesNo(input.fill_first) ? { fillFirst: true } : {}),
    ...(String(input.notes ?? '').trim() ? { notes: String(input.notes).trim() } : {}),
  }
  const { save, remove } = useVehiclesStore.getState()
  return {
    kind: 'ready',
    title: `Add ${name}?`,
    details: [
      vehicleLine(vehicle),
      ...(seats ? [] : ['5 seats, as none were said — change it in Admin → Vehicles if not.']),
    ],
    confirm: 'Add',
    run: async () => {
      await save(vehicle)
      return `Added ${name}.`
    },
    undo: async () => {
      await remove(vehicle)
      return `${name} is off the list again.`
    },
  } satisfies Prepared
}

export async function updateVehicle(profile: UserProfile, input: Record<string, unknown>) {
  if (!isAdmin(profile)) return cannot('Only admins can do that.')
  const vehicles = await readVehicles()
  const found = vehicleNamed(vehicles, String(input.vehicle ?? ''))
  if (!found) return cannot('I couldn’t find that vehicle.')
  if (Array.isArray(found)) {
    return {
      kind: 'choose',
      title: 'Which vehicle?',
      options: found
        .slice(0, 4)
        .map((v) => ({ label: v.name, input: { ...input, vehicle: v.name } })),
    } satisfies Prepared
  }
  const before = found
  const add = known(input.add_driver_ids)
  const drop = new Set(known(input.remove_driver_ids))
  const newName = String(input.new_name ?? '').trim()
  const seats = seatsOf(input.seats)
  const trailer = trailerOf(input.trailer)
  const notes = String(input.notes ?? '').trim()
  const together = yesNo(input.men_and_women_together)
  const first = yesNo(input.fill_first)
  const after: Vehicle = {
    ...before,
    ...(together !== null ? { mixedSex: together } : {}),
    ...(first !== null ? { fillFirst: first } : {}),
    ...(newName ? { name: newName } : {}),
    ...(seats ? { seats } : {}),
    ...(trailer ? { trailer } : {}),
    ...(notes ? { notes } : {}),
    drivers: [...new Set([...before.drivers, ...add])].filter((u) => !drop.has(u)),
  }
  const changes = [
    newName && newName !== before.name ? `Called ${newName}` : '',
    seats && seats !== before.seats ? `${seats} seats (was ${before.seats})` : '',
    trailer && trailer !== before.trailer
      ? `${TRAILER_LABELS[trailer]} (was ${TRAILER_LABELS[before.trailer].toLowerCase()})`
      : '',
    add.filter((u) => !before.drivers.includes(u)).length
      ? `May drive it now: ${add
          .filter((u) => !before.drivers.includes(u))
          .map(nameOf)
          .join(', ')}`
      : '',
    [...drop].filter((u) => before.drivers.includes(u)).length
      ? `No longer drives it: ${[...drop]
          .filter((u) => before.drivers.includes(u))
          .map(nameOf)
          .join(', ')}`
      : '',
    together !== null && together !== !!before.mixedSex
      ? together
        ? 'Men and women may ride in it together'
        : 'Men’s or women’s only, by its driver'
      : '',
    first !== null && first !== !!before.fillFirst
      ? first
        ? 'Filled first when it goes'
        : 'No longer filled first'
      : '',
    notes && notes !== before.notes ? `Notes: ${notes}` : '',
  ].filter(Boolean)
  if (!changes.length) return cannot(`${before.name} is like that already.`)
  const { save } = useVehiclesStore.getState()
  return {
    kind: 'ready',
    title: `Change ${before.name}?`,
    details: changes,
    confirm: 'Save',
    run: async () => {
      await save(after)
      return 'Saved.'
    },
    undo: async () => {
      await save(before)
      return `${before.name} is back as it was.`
    },
  } satisfies Prepared
}

export async function removeVehicle(profile: UserProfile, input: Record<string, unknown>) {
  if (!isAdmin(profile)) return cannot('Only admins can do that.')
  const vehicles = await readVehicles()
  const found = vehicleNamed(vehicles, String(input.vehicle ?? ''))
  if (!found) return cannot('I couldn’t find that vehicle.')
  if (Array.isArray(found)) {
    return {
      kind: 'choose',
      title: 'Which vehicle?',
      options: found.slice(0, 4).map((v) => ({ label: v.name, input: { vehicle: v.name } })),
    } satisfies Prepared
  }
  if (found.id === ELIM_VAN_ID) {
    return cannot('The Elim Van can be changed, but not taken off the list.')
  }
  const { save, remove } = useVehiclesStore.getState()
  return {
    kind: 'ready',
    title: `Take ${found.name} off the list?`,
    details: [vehicleLine(found), 'It won’t be offered for carpools again.'],
    confirm: 'Remove',
    destructive: true,
    run: async () => {
      await remove(found)
      return `${found.name} is off the list.`
    },
    undo: async () => {
      await save(found)
      return `${found.name} is back on the list.`
    },
  } satisfies Prepared
}
