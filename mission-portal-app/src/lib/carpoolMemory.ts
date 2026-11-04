import type { CarpoolCarData } from '@/types/events'
import { pairKey } from '@/features/events/carpoolAssign'

/**
 * What the carpools have been, remembered for arranging the next: the cars
 * the team has — each by its name and how many it holds — who drives, and
 * who has ridden with whom. Kept in one document (carpoolMemory/main), for
 * admins only (firestore.rules), and added to whenever cars are saved: in an
 * event's form, on its page, or by Miriam.
 *
 * Each event's cars are kept as they were last saved, by the event's date,
 * so an arrangement saved twice counts once; the newest MOST_RIDES of them.
 * What two have done together, and who drives, is worked out from those.
 * The cars themselves are kept longer, by name: the newest MOST_CARS.
 *
 * Pure: the memory in, the memory out.
 */

/** A car as it went: its name and size, its driver, and who rode in it. */
export interface RideCar {
  label: string
  seats?: number
  driver: string
  riders: string[]
}

export interface CarpoolMemory {
  /** The cars, by their name as a key (carKey). `at`: when last used, ms. */
  cars: Record<string, { label: string; seats?: number; at: number }>
  /** Each event's cars, by the event and date they went to. `at`: that date, ms. */
  rides: Record<string, { at: number; cars: RideCar[] }>
}

export const MOST_RIDES = 40
export const MOST_CARS = 60

export const emptyMemory = (): CarpoolMemory => ({ cars: {}, rides: {} })

/** A car's name as it is looked up: "Andy’s Van" and "andy's van" the same. */
export const carKey = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()

/** A key safe to keep as a field's name. */
const fieldKey = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)

/** The memory as read: anything that isn't one, an empty one. */
export function memoryFrom(data: unknown): CarpoolMemory {
  const d = (data ?? {}) as Partial<CarpoolMemory>
  return {
    cars: d.cars && typeof d.cars === 'object' ? d.cars : {},
    rides: d.rides && typeof d.rides === 'object' ? d.rides : {},
  }
}

/**
 * An event's cars, saved: kept as its ride (in place of what it had), and
 * each named car remembered with its size.
 */
export function withRide(
  memory: CarpoolMemory,
  key: string,
  /** The event's date, YYYY-MM-DD; '' for none (now). */
  date: string,
  cars: CarpoolCarData[],
  now = Date.now()
): CarpoolMemory {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00Z`) : now
  const ride: RideCar[] = cars
    .map((c) => ({
      label: c.label.trim(),
      ...(c.seats ? { seats: c.seats } : {}),
      driver: c.driver,
      riders: c.riders.filter(Boolean),
    }))
    .filter((c) => c.driver || c.riders.length)
  const rides = { ...memory.rides }
  if (ride.length) rides[fieldKey(key)] = { at, cars: ride }
  else delete rides[fieldKey(key)]
  const keptRides = Object.entries(rides)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MOST_RIDES)

  const known = { ...memory.cars }
  for (const c of cars) {
    const name = carKey(c.label)
    // "Car 1" and the like are no car of anyone's to remember.
    if (!name || /^car \d+$/.test(name)) continue
    const before = known[fieldKey(name)]
    known[fieldKey(name)] = {
      label: c.label.trim(),
      ...((c.seats ?? before?.seats) ? { seats: c.seats ?? before?.seats } : {}),
      at: Math.max(now, before?.at ?? 0),
    }
  }
  const keptCars = Object.entries(known)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MOST_CARS)
  return { cars: Object.fromEntries(keptCars), rides: Object.fromEntries(keptRides) }
}

/**
 * How many times each two have ridden in the same car — the driver counted
 * — but for `except`: the event being arranged, whose own last arrangement is
 * no other time.
 */
export function togetherCounts(memory: CarpoolMemory, except?: string): Map<string, number> {
  const counts = new Map<string, number>()
  const skip = except ? fieldKey(except) : null
  for (const [key, ride] of Object.entries(memory.rides)) {
    if (key === skip) continue
    for (const car of ride.cars ?? []) {
      const inIt = [...new Set([car.driver, ...(car.riders ?? [])].filter(Boolean))]
      for (let i = 0; i < inIt.length; i++) {
        for (let j = i + 1; j < inIt.length; j++) {
          const k = pairKey(inIt[i], inIt[j])
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
      }
    }
  }
  return counts
}

/** Who has driven, most often first, with how many times: across the rides kept. */
export function usualDrivers(memory: CarpoolMemory): { uid: string; times: number }[] {
  const times = new Map<string, number>()
  for (const ride of Object.values(memory.rides)) {
    for (const car of ride.cars ?? []) {
      if (car.driver) times.set(car.driver, (times.get(car.driver) ?? 0) + 1)
    }
  }
  return [...times.entries()]
    .map(([uid, n]) => ({ uid, times: n }))
    .sort((a, b) => b.times - a.times || a.uid.localeCompare(b.uid))
}

/**
 * The cars remembered, most recently used first, each with its size and
 * whoever has driven it most.
 */
export function rememberedCars(
  memory: CarpoolMemory
): { label: string; seats?: number; driver?: string }[] {
  const drove = new Map<string, Map<string, number>>()
  for (const ride of Object.values(memory.rides)) {
    for (const car of ride.cars ?? []) {
      const name = carKey(car.label ?? '')
      if (!name || !car.driver) continue
      const byDriver = drove.get(name) ?? new Map<string, number>()
      byDriver.set(car.driver, (byDriver.get(car.driver) ?? 0) + 1)
      drove.set(name, byDriver)
    }
  }
  return Object.values(memory.cars)
    .sort((a, b) => b.at - a.at || a.label.localeCompare(b.label))
    .map((c) => {
      const byDriver = drove.get(carKey(c.label))
      const driver = byDriver
        ? [...byDriver.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
        : undefined
      return {
        label: c.label,
        ...(c.seats ? { seats: c.seats } : {}),
        ...(driver ? { driver } : {}),
      }
    })
}

/** A car's size as remembered, by its name; undefined when it isn't. */
export function seatsRemembered(memory: CarpoolMemory, label: string): number | undefined {
  const name = carKey(label)
  return name ? memory.cars[fieldKey(name)]?.seats : undefined
}
