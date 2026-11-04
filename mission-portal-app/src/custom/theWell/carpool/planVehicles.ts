import type { CarpoolCarData, CarpoolChild } from '@/types/events'
import type { Sex } from '@/types/user'
import { autoAssign } from '@/features/events/carpoolAssign'
import { canPull, type TrailersNeeded, type Vehicle } from '../vehicles/types'

/**
 * Custom: The Well. A carpool planned from the team's vehicles (Admin →
 * Vehicles): which vehicles go, who drives each, which pulls a trailer — then
 * who rides where, by the app's auto-assign (features/events/carpoolAssign).
 *
 * What it must have:
 *  - A driver for each vehicle that goes: someone going who may drive it, and
 *    drives nothing else. The Elim Van (anyDriver) may be driven by anyone
 *    who may drive another of the vehicles. Someone who can't drive this time
 *    (`cantDrive`) isn't asked to, and rides instead.
 *  - The trailers asked for: the big one behind a vehicle that can pull it,
 *    the small one behind another that can.
 *  - Vehicles asked about ("Bring the Elim Van?") only when the answer is yes;
 *    one added by hand, or with children in it, always.
 *
 * And then, in this order:
 *  1. Men with men and women with women: as few as can be in a vehicle with
 *     the other sex (each vehicle's driver decides whose it is).
 *  2. As few vehicles as possible.
 *  3. No vehicle full: the most seats to spare. When a vehicle is full all the
 *     same, the next one to bring is offered (`offer`).
 *
 * Pure: nothing read or written.
 */

export interface PlanPerson {
  uid: string
  sex?: Sex
}

export interface PlanInput {
  vehicles: Vehicle[]
  /** Everyone going, who will be in a vehicle — drivers among them. */
  people: PlanPerson[]
  trailers: TrailersNeeded
  /** Vehicles asked about (ask): true to bring it. Not answered is not brought. */
  bring?: Record<string, boolean>
  /** Who can't drive this time: they ride. */
  cantDrive?: readonly string[]
  /** Vehicles added by hand: they go. */
  add?: readonly string[]
  /** Children in a vehicle, by its id: it goes, and they take seats in it. */
  children?: Record<string, CarpoolChild[]>
  /** How many times two have ridden together before (lib/carpoolMemory). */
  together?: ReadonlyMap<string, number>
  seed?: number
}

export interface PlannedVehicle {
  vehicle: Vehicle
  driver: string
  /** The trailer it pulls, if any. */
  trailer: 'small' | 'big' | null
}

export interface Plan {
  vehicles: PlannedVehicle[]
  /** The cars, as the event keeps them: each vehicle's driver, riders, children. */
  cars: CarpoolCarData[]
  /** Those there was no seat for. */
  noRoom: string[]
  /** Vehicles full, by id. */
  full: string[]
  /** The vehicle to bring next, when one is full or someone has no seat; null when none can go. */
  offer: Vehicle | null
  /** How many are in a vehicle with the other sex: what the plan couldn't avoid. */
  mixed: number
  /** Vehicles not going, and why. */
  left: { vehicle: Vehicle; why: 'not needed' | 'no driver going' | 'not brought' }[]
  /** What it couldn't do: "No one going can pull the big trailer." */
  problems: string[]
}

/** Past this many vehicles to choose among, only the biggest are tried: the rest can still be added by hand. */
const MOST_TRIED = 14

/** Who may drive a vehicle, among those going and able to this time. */
export function driversFor(
  v: Vehicle,
  all: Vehicle[],
  going: ReadonlySet<string>,
  cantDrive: ReadonlySet<string>
): string[] {
  const listed = v.anyDriver
    ? [...v.drivers, ...all.filter((o) => o.id !== v.id).flatMap((o) => o.drivers)]
    : v.drivers
  return [...new Set(listed)].filter((u) => going.has(u) && !cantDrive.has(u))
}

interface Choice {
  set: Vehicle[]
  drivers: string[]
  trailers: ('small' | 'big' | null)[]
  mixed: number
  spare: number
}

export function planVehicles(input: PlanInput): Plan {
  const people = [...new Map(input.people.map((p) => [p.uid, p])).values()]
  const going = new Set(people.map((p) => p.uid))
  const sexOf = new Map(people.map((p) => [p.uid, p.sex]))
  const cantDrive = new Set(input.cantDrive ?? [])
  const kids = (v: Vehicle) => input.children?.[v.id]?.length ?? 0
  const allKids = Object.values(input.children ?? {}).reduce((n, k) => n + k.length, 0)
  const need = people.length + allKids
  const problems: string[] = []
  const left: Plan['left'] = []

  const eligible = new Map(
    input.vehicles.map((v) => [v.id, driversFor(v, input.vehicles, going, cantDrive)])
  )
  const required: Vehicle[] = []
  const optional: Vehicle[] = []
  for (const v of input.vehicles) {
    const forced = (input.add ?? []).includes(v.id) || kids(v) > 0
    if (v.ask && !input.bring?.[v.id] && !forced) {
      left.push({ vehicle: v, why: 'not brought' })
      continue
    }
    if (!eligible.get(v.id)!.length) {
      left.push({ vehicle: v, why: 'no driver going' })
      if (forced || (v.ask && input.bring?.[v.id])) {
        problems.push(`No one going can drive ${v.name}.`)
      }
      continue
    }
    if (forced || (v.ask && input.bring?.[v.id])) required.push(v)
    else optional.push(v)
  }
  const tried = [...optional].sort((a, b) => b.seats - a.seats).slice(0, MOST_TRIED)

  const men = people.filter((p) => p.sex === 'male').length
  const women = people.filter((p) => p.sex === 'female').length

  /** The best drivers and trailers for these vehicles: fewest mixed. Null when there aren't drivers enough, or trailers can't be pulled. */
  const fit = (
    set: Vehicle[],
    needed: TrailersNeeded = input.trailers
  ): Omit<Choice, 'spare'> | null => {
    const trailers = trailersFor(set, needed)
    if (!trailers) return null
    // Each vehicle's driver is a man, a woman, or one not said: tried each way it can be.
    const options = set.map((v) => {
      const list = eligible.get(v.id)!
      const bySex = new Map<string, string[]>()
      for (const u of list) {
        const s = sexOf.get(u) ?? 'unknown'
        bySex.set(s, [...(bySex.get(s) ?? []), u])
      }
      return [...bySex.entries()]
    })
    let best: Omit<Choice, 'spare'> | null = null
    const pick: string[] = new Array(set.length).fill('')
    const walk = (i: number) => {
      if (i === set.length) {
        const drivers = matchDrivers(set, pick, options)
        if (!drivers) return
        const mixed = mixedFor(set, pick, kids, men, women)
        if (!best || mixed < best.mixed) best = { set, drivers, trailers, mixed }
        return
      }
      for (const [sex] of options[i]) {
        pick[i] = sex
        walk(i + 1)
      }
    }
    walk(0)
    return best
  }

  const seatsOf = (set: Vehicle[]) => set.reduce((n, v) => n + v.seats, 0)
  const better = (a: Choice, b: Choice | null) =>
    !b ||
    a.mixed < b.mixed ||
    (a.mixed === b.mixed && a.set.length < b.set.length) ||
    (a.mixed === b.mixed && a.set.length === b.set.length && a.spare > b.spare)

  let best: Choice | null = null
  for (let k = 0; k <= tried.length; k++) {
    // Every vehicle more is worse than one fewer with no one mixed: none to find.
    if (best && best.mixed === 0 && required.length + k > best.set.length) break
    for (const combo of combinations(tried, k)) {
      const set = [...required, ...combo]
      if (!set.length || seatsOf(set) < need) continue
      const f = fit(set)
      if (!f) continue
      const choice = { ...f, spare: seatsOf(set) - need }
      if (better(choice, best)) best = choice
    }
  }

  // Not enough seats however it is done — or drivers, or trailers: as many
  // vehicles as can go together, biggest first, and who has no seat said.
  const most = (needed: TrailersNeeded): Choice | null => {
    let set: Vehicle[] = []
    for (const v of [...required, ...tried]) if (fit([...set, v], needed)) set = [...set, v]
    const f = set.length ? fit(set, needed) : null
    return f ? { ...f, spare: seatsOf(set) - need } : null
  }
  if (!best) best = most(input.trailers)
  if (!best && (input.trailers.big || input.trailers.small)) {
    const all = [...required, ...tried]
    if (input.trailers.big && !all.some((v) => canPull(v, 'big'))) {
      problems.push('No vehicle with a driver going can pull the big trailer.')
    } else if (input.trailers.small && !all.some((v) => canPull(v, 'small'))) {
      problems.push('No vehicle with a driver going can pull the small trailer.')
    } else {
      problems.push('Both trailers need two vehicles that can pull them, with a driver each.')
    }
    best = most({ small: false, big: false })
  }
  if (!best) {
    if (!input.vehicles.length) problems.push('No vehicles yet — add them in Admin → Vehicles.')
    else if (!problems.length) problems.push('No vehicle has a driver going.')
    return {
      vehicles: [],
      cars: [],
      noRoom: people.map((p) => p.uid),
      full: [],
      offer: null,
      mixed: 0,
      left,
      problems,
    }
  }

  const chosen = best
  const planned: PlannedVehicle[] = chosen.set.map((vehicle, i) => ({
    vehicle,
    driver: chosen.drivers[i],
    trailer: chosen.trailers[i],
  }))
  const assigned = autoAssign({
    cars: planned.map((p) => ({
      id: p.vehicle.id,
      label: p.vehicle.name,
      seats: p.vehicle.seats,
      driver: p.driver,
      children: input.children?.[p.vehicle.id] ?? [],
    })),
    people,
    together: input.together,
    seed: input.seed,
  })
  const full = assigned.cars
    .filter(
      (c) => (c.driver ? 1 : 0) + c.riders.length + (c.children?.length ?? 0) >= (c.seats ?? 0)
    )
    .map((c) => c.id)
  for (const v of tried) {
    if (!chosen.set.includes(v)) left.push({ vehicle: v, why: 'not needed' })
  }
  for (const v of optional.filter((o) => !tried.includes(o)))
    left.push({ vehicle: v, why: 'not needed' })

  // The one to bring next: a vehicle not going whose driver isn't driving
  // already — the most seats, then the fewest mixed.
  let offer: Vehicle | null = null
  if (full.length || assigned.noRoom.length) {
    const spareFor = [...optional]
      .filter((v) => !chosen.set.includes(v))
      .map((v) => ({ v, f: fit([...chosen.set, v]) }))
      .filter((x) => x.f)
      .sort((a, b) => a.f!.mixed - b.f!.mixed || b.v.seats - a.v.seats)
    offer = spareFor[0]?.v ?? null
  }

  return {
    vehicles: planned,
    cars: assigned.cars,
    noRoom: assigned.noRoom,
    full,
    offer,
    mixed: chosen.mixed,
    left,
    problems,
  }
}

/** Which vehicle pulls which trailer: the big behind one that can, the small behind another. Null when they can't be. */
function trailersFor(set: Vehicle[], needed: TrailersNeeded): ('small' | 'big' | null)[] | null {
  const out: ('small' | 'big' | null)[] = set.map(() => null)
  if (needed.big) {
    // The big one behind a vehicle that can pull only the… both can; keep a
    // small-only one free for the small trailer by taking a "both" first.
    const i = set.findIndex((v) => canPull(v, 'big'))
    if (i < 0) return null
    // With the small one wanted too, the big goes behind a "both" that leaves
    // another able to pull the small.
    if (needed.small) {
      const bigs = set.map((v, j) => (canPull(v, 'big') ? j : -1)).filter((j) => j >= 0)
      const choice = bigs.find((j) => set.some((v, x) => x !== j && canPull(v, 'small')))
      if (choice === undefined) return null
      out[choice] = 'big'
    } else out[i] = 'big'
  }
  if (needed.small) {
    // A small-only vehicle first, keeping one that can pull either for the big.
    const order = set
      .map((v, j) => ({ v, j }))
      .filter(({ v, j }) => out[j] === null && canPull(v, 'small'))
      .sort((a, b) => Number(a.v.trailer === 'both') - Number(b.v.trailer === 'both'))
    if (!order.length) return null
    out[order[0].j] = 'small'
  }
  return out
}

/**
 * Distinct drivers, one a vehicle, each of the sex picked for it — those who
 * may drive the fewest vehicles placed first, so the rest stay free. Null when
 * there aren't drivers enough.
 */
function matchDrivers(
  set: Vehicle[],
  sexes: string[],
  options: [string, string[]][][]
): string[] | null {
  const lists = set.map((_, i) => options[i].find(([s]) => s === sexes[i])?.[1] ?? [])
  const order = set.map((_, i) => i).sort((a, b) => lists[a].length - lists[b].length)
  const used = new Set<string>()
  const out: string[] = new Array(set.length).fill('')
  const go = (n: number): boolean => {
    if (n === order.length) return true
    const i = order[n]
    for (const u of lists[i]) {
      if (used.has(u)) continue
      used.add(u)
      out[i] = u
      if (go(n + 1)) return true
      used.delete(u)
    }
    return false
  }
  return go(0) ? out : null
}

/**
 * How many must ride with the other sex, at least, with drivers of these
 * sexes: the men beyond the men's vehicles' seats, and the women beyond the
 * women's — less what vehicles whose driver's sex isn't known can take.
 */
function mixedFor(
  set: Vehicle[],
  sexes: string[],
  kids: (v: Vehicle) => number,
  men: number,
  women: number
): number {
  let mens = 0
  let womens = 0
  let open = 0
  set.forEach((v, i) => {
    const seats = Math.max(0, v.seats - kids(v))
    if (sexes[i] === 'male') mens += seats
    else if (sexes[i] === 'female') womens += seats
    else open += seats
  })
  const over = Math.max(0, men - mens) + Math.max(0, women - womens)
  return Math.max(0, over - open)
}

/** Every way of choosing k from the list, in order. */
function* combinations<T>(list: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked
    return
  }
  for (let i = start; i <= list.length - (k - picked.length); i++) {
    yield* combinations(list, k, i + 1, [...picked, list[i]])
  }
}
