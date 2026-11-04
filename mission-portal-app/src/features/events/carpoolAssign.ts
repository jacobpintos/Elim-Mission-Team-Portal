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
 *     mixed as the fewest who would have to leave it for none to be. Two who
 *     share a last name — a family — may ride together whatever their sex,
 *     and so may anyone allowed to ride with either (`rules.eitherSex`).
 *     Those to be kept together are, and those to be kept apart are.
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
  /** Their last name, as familyName gives it: two who share one may ride together whatever their sex. */
  family?: string
}

/** Seating rules for particular people (src/custom: The Well's, from Admin → Vehicles). */
export interface SeatingRules {
  /** May ride with men or women: counted as neither. */
  eitherSex?: ReadonlySet<string>
  /** Two to put in the same car. */
  together?: readonly (readonly [string, string])[]
  /** Two never to put in the same car. */
  apart?: readonly (readonly [string, string])[]
}

/**
 * A family, by the last name: the last word of a name of two words or more,
 * as a key — "Sam Hart" and "Beth Hart" share "hart". A single name has none.
 */
export function familyName(name: string | undefined | null): string {
  const parts = (name ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z'-]/g, ''))
    .filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 1] : ''
}

export interface AssignInput {
  cars: AssignCar[]
  /** Everyone on the event. */
  people: AssignPerson[]
  /** Not to be put in a car: driving themselves, not coming in one. */
  leftOut?: readonly string[]
  /** How many times two have ridden together before, by pairKey. */
  together?: ReadonlyMap<string, number>
  /** Rules for particular people: who may ride with either sex, who together, who apart. */
  rules?: SeatingRules
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
/** Two to be kept together, apart; or two to be kept apart, together. */
const RULE = 8
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
  const drivers = new Set(input.cars.map((c) => c.driver).filter(Boolean))
  const left = new Set(input.leftOut ?? [])
  const random = seeded(input.seed ?? 1)
  const riders = shuffle(
    [...new Set(input.people.map((p) => p.uid))].filter(
      (u) => u && !drivers.has(u) && !left.has(u)
    ),
    random
  )
  const context = costContext(input.people, input.rules, input.together)
  /** Who rides at all — in a car or driving one: a pair kept together can only be where both are. */
  const riding = new Set([...drivers, ...riders])
  const costOf = (car: AssignCar, inIt: string[]) => carCost(car, inIt, context, riding)

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
  fillFirst: ReadonlySet<string> = new Set(),
  rules?: SeatingRules
): number {
  const context = costContext(people, rules, together)
  const riding = new Set(result.cars.flatMap((c) => [c.driver, ...c.riders].filter(Boolean)))
  let total = NO_ROOM * result.noRoom.length
  for (const car of result.cars) {
    total += carCost(
      {
        id: car.id,
        label: car.label,
        seats: car.seats ?? DEFAULT_SEATS,
        driver: car.driver,
        children: car.children,
        mixedSex: mixedSex.has(car.id),
        fillFirst: fillFirst.has(car.id),
      },
      car.riders,
      context,
      riding
    )
  }
  return total
}

/** What a car's cost is worked out from: who is who, and the rules for them. */
interface CostContext {
  sexOf: ReadonlyMap<string, Sex | undefined>
  familyOf: ReadonlyMap<string, string>
  either: ReadonlySet<string>
  /** Each person's partners to keep with, and to keep from. */
  withOf: ReadonlyMap<string, readonly string[]>
  apartOf: ReadonlyMap<string, readonly string[]>
  history: ReadonlyMap<string, number>
}

function costContext(
  people: AssignPerson[],
  rules: SeatingRules | undefined,
  history: ReadonlyMap<string, number> = new Map()
): CostContext {
  const pairsBy = (pairs: readonly (readonly [string, string])[] | undefined) => {
    const out = new Map<string, string[]>()
    for (const [a, b] of pairs ?? []) {
      if (!a || !b || a === b) continue
      out.set(a, [...(out.get(a) ?? []), b])
      out.set(b, [...(out.get(b) ?? []), a])
    }
    return out
  }
  return {
    sexOf: new Map(people.map((p) => [p.uid, p.sex])),
    familyOf: new Map(people.filter((p) => p.family).map((p) => [p.uid, p.family!])),
    either: rules?.eitherSex ?? new Set(),
    withOf: pairsBy(rules?.together),
    apartOf: pairsBy(rules?.apart),
    history,
  }
}

/** What one car costs with these in it (see autoAssign). */
function carCost(car: AssignCar, inIt: string[], c: CostContext, riding: ReadonlySet<string>) {
  const seats = seatsOf(car)
  const load = (car.driver ? 1 : 0) + (car.children?.length ?? 0) + inIt.length
  const adults = car.driver ? [car.driver, ...inIt] : inIt
  const here = new Set(adults)
  let again = 0
  for (let i = 0; i < adults.length; i++) {
    for (let j = i + 1; j < adults.length; j++) {
      again += Math.min(MOST_AGAIN, c.history.get(pairKey(adults[i], adults[j])) ?? 0)
    }
  }
  // Kept together, but not here together; kept apart, but here together.
  let broken = 0
  for (const u of adults) {
    for (const w of c.withOf.get(u) ?? []) if (riding.has(w) && !here.has(w)) broken++
    for (const w of c.apartOf.get(u) ?? []) if (here.has(w)) broken++
  }
  const mixing = car.mixedSex ? 0 : MIXED * mixedIn(adults, c)
  const rules = RULE * broken
  // Filled first: a seat taken in it costs nothing, so it takes all it can.
  if (car.fillFirst) return mixing + rules + AGAIN * again
  return (
    mixing +
    rules +
    (inIt.length > 0 && load >= seats ? FULL : 0) +
    EVEN * (load / seats) ** 2 +
    AGAIN * again
  )
}

/**
 * How mixed a car is: the fewest who would have to leave it for no man to
 * ride with a woman he isn't family to. Anyone who may ride with either sex
 * isn't counted. With no families, that is the fewer of the men and women.
 */
function mixedIn(adults: string[], c: CostContext): number {
  const men = adults.filter((u) => c.sexOf.get(u) === 'male' && !c.either.has(u))
  const women = adults.filter((u) => c.sexOf.get(u) === 'female' && !c.either.has(u))
  if (!men.length || !women.length) return 0
  const clash = (m: string, w: string) => {
    const f = c.familyOf.get(m)
    return !(f && f === c.familyOf.get(w))
  }
  // The most pairs that clash with no one in two of them (a matching): as
  // many must leave, one from each, and that many is enough (König).
  const partner = new Map<string, string>()
  const reach = (m: string, seen: Set<string>): boolean => {
    for (const w of women) {
      if (seen.has(w) || !clash(m, w)) continue
      seen.add(w)
      const other = partner.get(w)
      if (!other || reach(other, seen)) {
        partner.set(w, m)
        return true
      }
    }
    return false
  }
  let n = 0
  for (const m of men) if (reach(m, new Set())) n++
  return n
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
