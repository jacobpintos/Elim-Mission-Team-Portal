import type { CarpoolCarData, CarpoolChild } from '@/types/events'
import type { Sex } from '@/types/user'

/**
 * The carpool builder's arithmetic, kept apart from its screen so it can be
 * tested without one: who is where, and what moving a card does.
 */

/**
 * A card's colours: blue for male, pink for female, green for a child — light
 * fills with dark writing, so they read the same in light and dark mode. A
 * person with neither set takes the theme's own card colours.
 */
export const CARD_COLORS = {
  male: { background: '#DBEAFE', border: '#3B82F6', text: '#1E3A8A' },
  female: { background: '#FCE7F3', border: '#EC4899', text: '#831843' },
  child: { background: '#DCFCE7', border: '#22C55E', text: '#14532D' },
} as const

/** The colours for a person's card, or null for the theme's. */
export const cardColorsFor = (sex: Sex | undefined | null) =>
  sex === 'male' || sex === 'female' ? CARD_COLORS[sex] : null

/** Where a card can be put: a car's driver's seat, its passengers, or back in the pool. */
export type Spot =
  | { kind: 'driver'; carId: string }
  | { kind: 'passenger'; carId: string }
  | { kind: 'pool' }

/** Where someone is now: in which car, and in what seat — or nowhere. */
export function spotOf(cars: CarpoolCarData[], uid: string): Spot {
  for (const car of cars) {
    if (car.driver === uid) return { kind: 'driver', carId: car.id }
    if (car.riders.includes(uid)) return { kind: 'passenger', carId: car.id }
  }
  return { kind: 'pool' }
}

/**
 * Put someone in a spot, taking them out of wherever they were.
 *
 * A driver's seat that is taken is swapped rather than doubled: whoever was
 * driving goes to the place the new driver came from — back to the pool if
 * they came from there, into the passengers if they were one.
 */
export function moveTo(cars: CarpoolCarData[], uid: string, to: Spot): CarpoolCarData[] {
  if (!uid) return cars
  const from = spotOf(cars, uid)
  if (from.kind === to.kind && (to.kind === 'pool' || ('carId' in from && from.carId === to.carId)))
    return cars
  // Whoever is displaced from the driver's seat, and where they go.
  const target = to.kind === 'driver' ? cars.find((c) => c.id === to.carId) : undefined
  const bumped = target?.driver && target.driver !== uid ? target.driver : ''

  let next = cars.map((c) => ({
    ...c,
    driver: c.driver === uid ? '' : c.driver,
    riders: c.riders.filter((r) => r !== uid),
  }))
  if (to.kind === 'pool') return next

  next = next.map((c) => {
    if (c.id !== to.carId) return c
    if (to.kind === 'driver')
      return { ...c, driver: uid, riders: c.riders.filter((r) => r !== uid) }
    return { ...c, riders: [...c.riders, uid] }
  })
  if (!bumped) return next
  // The displaced driver takes the new driver's old place.
  if (from.kind === 'pool') return next
  return next.map((c) => {
    if (c.id !== from.carId) return c
    if (from.kind === 'driver') return { ...c, driver: bumped }
    return { ...c, riders: [...c.riders, bumped] }
  })
}

/** Everyone in a car, as driver or passenger. */
export const placedUids = (cars: CarpoolCarData[]) =>
  new Set(cars.flatMap((c) => [c.driver, ...c.riders].filter(Boolean)))

/** Who is on the event and not yet in a car, in the order given. */
export const unplaced = (cars: CarpoolCarData[], people: string[]) => {
  const placed = placedUids(cars)
  return people.filter((uid) => !placed.has(uid))
}

/** A new, empty car. The id only has to be unique among this event's cars. */
export const newCar = (existing: CarpoolCarData[]): CarpoolCarData => ({
  id: uniqueId(existing.map((c) => c.id)),
  label: '',
  driver: '',
  riders: [],
})

/** A child added to a car, to be named on its card. */
export const newChild = (car: CarpoolCarData): CarpoolChild => ({
  id: uniqueId((car.children ?? []).map((c) => c.id)),
  name: '',
})

function uniqueId(taken: string[]): string {
  const base = Date.now().toString(36)
  let id = base
  for (let n = 1; taken.includes(id); n++) id = `${base}_${n}`
  return id
}

/** What a car is called: its name, or its place in the list. */
export const carName = (car: CarpoolCarData, index: number) =>
  car.label.trim() || `Car ${index + 1}`

/** How many are in a car: its driver, passengers and children. */
export const headCount = (car: CarpoolCarData) =>
  (car.driver ? 1 : 0) + car.riders.length + (car.children?.length ?? 0)

/**
 * The cars as they are saved: names trimmed and children's names too, and
 * anyone with no account in the list of people (a uid of '') left out.
 */
export function tidyCars(cars: CarpoolCarData[]): CarpoolCarData[] {
  return cars.map((c) => {
    const children = (c.children ?? []).map((k) => ({ id: k.id, name: k.name.trim() }))
    const car: CarpoolCarData = {
      id: c.id,
      label: c.label.trim(),
      driver: c.driver ?? '',
      riders: c.riders.filter(Boolean),
    }
    if (c.seats) car.seats = c.seats
    if (children.length) car.children = children
    return car
  })
}

/** A car's children, as listed with its passengers: "Joey (child)", or "a child" if not named yet. */
export const childNames = (car: Pick<CarpoolCarData, 'children'>) =>
  (car.children ?? []).map((k) => (k.name.trim() ? `${k.name.trim()} (child)` : 'a child'))

/** Lower case with the accents taken off, so "jose" finds José. */
const folded = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Whether a name answers a search: every word typed is somewhere in it, in any
 * order — "jac", "pintos" and "jac pin" all find Jacob Pintos.
 */
export function matchesSearch(name: string, query: string): boolean {
  const words = folded(query).split(/\s+/).filter(Boolean)
  const target = folded(name)
  return words.every((w) => target.includes(w))
}
