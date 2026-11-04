import type { CarpoolCarData, CarpoolChild } from '@/types/events'
import type { Sex } from '@/types/user'

/**
 * Auto-assign: who rides in which car, worked out from the cars an admin sets
 * up — each car's name, how many it holds, its driver and any children — and
 * whoever on the event isn't to ride (left out).
 *
 * What it looks for, most first:
 *  1. Everyone in a car, as far as the seats go. Who doesn't fit is said.
 *  2. Men with men and women with women, the driver counted: a car is as
 *     mixed as the fewer of the two in it.
 *  3. No car full while another has room: cars filled about as evenly as
 *     their sizes allow.
 *  4. Not the same people together every time: two who have ridden together
 *     before (`together`) are kept apart where it costs nothing else.
 *
 * A car with no driver yet is filled to its every seat: everyone on the
 * event is put in a car, so its driver is one of those in it, picked from
 * them afterwards — no seat is kept empty for someone who isn't coming.
 * Children ride where they were put. A seeded shuffle decides between
 * arrangements as good as each other, so asking again can give another.
 *
 * Pure: the cars and people in, the cars out — nothing read or written.
 */

export interface AssignCar {
  id: string
  label: string
  /** The most it holds, driver and children counted. */
  seats: number
  /** '' for none yet: one of its riders, to be picked. */
  driver: string
  children?: CarpoolChild[]
  /** Men and women ride in it together (the Elim Van): nobody in it counts as mixed. */
  mixedSex?: boolean
  /**
   * Filled before the others (the Elim Van, when it goes), so fewer cars are
   * needed: full is no fault in it, and it isn't kept even with them.
   */
  fillFirst?: boolean
}

export interface AssignPerson {
  uid: string
  sex?: Sex
}

export interface AssignInput {
  cars: AssignCar[]
  /** Everyone on the event. */
  people: AssignPerson[]
  /** Not to be put in a car: driving themselves, not coming in one. */
  leftOut?: readonly string[]
  /** How many times two have ridden together before, by pairKey. */
  together?: ReadonlyMap<string, number>
  /** For the shuffle between arrangements as good as each other. */
  seed?: number
}

export interface AssignResult {
  cars: CarpoolCarData[]
  /** Those there was no seat for. */
  noRoom: string[]
}

/** Two people, in either order. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** A car's size, when none was given: an ordinary car's. */
export const DEFAULT_SEATS = 5

// How much each counts against an arrangement (see above).
const NO_ROOM = 1000
const MIXED = 6
const FULL = 3
const EVEN = 4
const AGAIN = 1
/** Past this many times together, it counts no more: a pair who always ride together isn't made to never. */
const MOST_AGAIN = 3

/** Riders' seats in a car: what it holds, less its driver's (when it has one) and its children's. */
export const roomFor = (car: AssignCar) =>
  Math.max(0, seatsOf(car) - (car.driver ? 1 : 0) - (car.children?.length ?? 0))

const seatsOf = (car: AssignCar) =>
  Number.isFinite(car.seats) && car.seats > 0 ? Math.floor(car.seats) : DEFAULT_SEATS

export function autoAssign(input: AssignInput): AssignResult {
  const sexOf = new Map(input.people.map((p) => [p.uid, p.sex]))
  const drivers = new Set(input.cars.map((c) => c.driver).filter(Boolean))
  const left = new Set(input.leftOut ?? [])
  const random = seeded(input.seed ?? 1)
  const riders = shuffle(
    [...new Set(input.people.map((p) => p.uid))].filter(
      (u) => u && !drivers.has(u) && !left.has(u)
    ),
    random
  )
  const together = input.together ?? new Map<string, number>()

  /** What one car's riders cost (see above). */
  const costOf = (car: AssignCar, inIt: string[]) => {
    const seats = seatsOf(car)
    const load = (car.driver ? 1 : 0) + (car.children?.length ?? 0) + inIt.length
    const adults = car.driver ? [car.driver, ...inIt] : inIt
    let men = 0
    let women = 0
    for (const u of adults) {
      const sex = sexOf.get(u)
      if (sex === 'male') men++
      else if (sex === 'female') women++
    }
    let again = 0
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        again += Math.min(MOST_AGAIN, together.get(pairKey(adults[i], adults[j])) ?? 0)
      }
    }
    const mixing = car.mixedSex ? 0 : MIXED * Math.min(men, women)
    // Filled first: a seat taken in it costs nothing, so it takes all it can.
    if (car.fillFirst) return mixing + AGAIN * again
    return (
      mixing +
      (inIt.length > 0 && load >= seats ? FULL : 0) +
      EVEN * (load / seats) ** 2 +
      AGAIN * again
    )
  }

  const cars = input.cars
  const room = cars.map(roomFor)
  const inCar: string[][] = cars.map(() => [])
  const noRoom: string[] = []

  // Each in turn, where they add least.
  for (const uid of riders) {
    let best = -1
    let bestAdds = Infinity
    cars.forEach((car, i) => {
      if (inCar[i].length >= room[i]) return
      const adds = costOf(car, [...inCar[i], uid]) - costOf(car, inCar[i])
      if (adds < bestAdds) {
        bestAdds = adds
        best = i
      }
    })
    if (best < 0) noRoom.push(uid)
    else inCar[best].push(uid)
  }

  // Then better, a move or a swap at a time, while one helps. Those without a
  // seat are a car of their own, so a swap can seat one in another's place.
  const costs = cars.map((car, i) => costOf(car, inCar[i]))
  const better = (a: number, b: number, nextA: string[], nextB: string[]) => {
    const now = costs[a] + costs[b]
    const ca = costOf(cars[a], nextA)
    const cb = costOf(cars[b], nextB)
    if (ca + cb < now - 1e-9) {
      inCar[a] = nextA
      inCar[b] = nextB
      costs[a] = ca
      costs[b] = cb
      return true
    }
    return false
  }
  for (let pass = 0, changed = true; changed && pass < 40; pass++) {
    changed = false
    for (let a = 0; a < cars.length; a++) {
      for (let b = 0; b < cars.length; b++) {
        if (a === b) continue
        // Moved: one from a to b, where b has room.
        for (const uid of [...inCar[a]]) {
          if (inCar[b].length >= room[b]) break
          if (
            better(
              a,
              b,
              inCar[a].filter((x) => x !== uid),
              [...inCar[b], uid]
            )
          ) {
            changed = true
          }
        }
        if (b < a) continue
        // Swapped: one of a's for one of b's.
        for (const x of [...inCar[a]]) {
          for (const y of [...inCar[b]]) {
            if (!inCar[a].includes(x) || !inCar[b].includes(y)) continue
            const nextA = inCar[a].map((u) => (u === x ? y : u))
            const nextB = inCar[b].map((u) => (u === y ? x : u))
            if (better(a, b, nextA, nextB)) changed = true
          }
        }
      }
      // A seat given to someone without one, in place of someone who fits
      // better with nobody (none of a's pairings, nothing mixed).
      for (let n = 0; n < noRoom.length; n++) {
        const waiting = noRoom[n]
        for (const x of [...inCar[a]]) {
          const nextA = inCar[a].map((u) => (u === x ? waiting : u))
          const ca = costOf(cars[a], nextA)
          if (ca < costs[a] - 1e-9) {
            inCar[a] = nextA
            costs[a] = ca
            noRoom[n] = x
            changed = true
            break
          }
        }
      }
    }
  }

  return {
    cars: cars.map((car, i) => ({
      id: car.id,
      label: car.label,
      seats: seatsOf(car),
      driver: car.driver,
      riders: inCar[i],
      ...(car.children?.length ? { children: car.children } : {}),
    })),
    noRoom,
  }
}

/**
 * The cars with no driver yet, by name — filled with riders, one of whom is to
 * drive: "Pick a driver for the bus from those in it."
 */
export function driverToPick(cars: CarpoolCarData[]): string {
  const names = cars
    .map((c, i) => (c.driver || !c.riders.length ? '' : c.label.trim() || `Car ${i + 1}`))
    .filter(Boolean)
  if (!names.length) return ''
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Pick a driver for ${list} from those in ${names.length === 1 ? 'it' : 'them'}.`
}

/** What an arrangement costs, all told — for tests, and to compare two. */
export function arrangementCost(
  result: AssignResult,
  people: AssignPerson[],
  together: ReadonlyMap<string, number> = new Map(),
  /** Cars men and women may share, by id. */
  mixedSex: ReadonlySet<string> = new Set(),
  /** Cars filled first, by id. */
  fillFirst: ReadonlySet<string> = new Set()
): number {
  const sexOf = new Map(people.map((p) => [p.uid, p.sex]))
  let total = NO_ROOM * result.noRoom.length
  for (const car of result.cars) {
    const seats = car.seats ?? DEFAULT_SEATS
    const load = (car.driver ? 1 : 0) + (car.children?.length ?? 0) + car.riders.length
    const adults = car.driver ? [car.driver, ...car.riders] : car.riders
    const men = adults.filter((u) => sexOf.get(u) === 'male').length
    const women = adults.filter((u) => sexOf.get(u) === 'female').length
    let again = 0
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        again += Math.min(MOST_AGAIN, together.get(pairKey(adults[i], adults[j])) ?? 0)
      }
    }
    const mixing = mixedSex.has(car.id) ? 0 : MIXED * Math.min(men, women)
    total += fillFirst.has(car.id)
      ? mixing + AGAIN * again
      : mixing +
        (car.riders.length > 0 && load >= seats ? FULL : 0) +
        EVEN * (load / seats) ** 2 +
        AGAIN * again
  }
  return total
}

/** A small, fast generator from a seed (mulberry32): the same seed, the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
