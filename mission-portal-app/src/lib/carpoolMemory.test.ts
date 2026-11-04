import { describe, expect, it } from 'vitest'
import { pairKey } from '@/features/events/carpoolAssign'
import type { CarpoolCarData } from '@/types/events'
import {
  carKey,
  emptyMemory,
  memoryFrom,
  MOST_RIDES,
  rememberedCars,
  seatsRemembered,
  togetherCounts,
  usualDrivers,
  withRide,
} from './carpoolMemory'

const car = (label: string, driver: string, riders: string[], seats?: number): CarpoolCarData => ({
  id: label,
  label,
  driver,
  riders,
  ...(seats ? { seats } : {}),
})

describe('remembering the carpools', () => {
  it('keeps the cars by name and size, and who has driven them most', () => {
    let memory = withRide(
      emptyMemory(),
      'ev1_2026-11-01',
      '2026-11-01',
      [car('Andy’s Van', 'andy', ['b', 'c'], 7), car('Car 2', 'sam', ['d'])],
      1000
    )
    memory = withRide(
      memory,
      'ev2_2026-11-08',
      '2026-11-08',
      [car("andy's van", 'andy', ['d']), car('Sam’s truck', 'sam', [], 3)],
      2000
    )
    // "Car 2" is nobody's car to remember; a size said once is kept. Used
    // last at the same time: by name.
    expect(rememberedCars(memory)).toEqual([
      { label: "andy's van", seats: 7, driver: 'andy' },
      { label: 'Sam’s truck', seats: 3, driver: 'sam' },
    ])
    expect(seatsRemembered(memory, 'ANDY’S VAN')).toBe(7)
    expect(carKey('  Andy’s   Van! ')).toBe("andy's van")
    expect(usualDrivers(memory)).toEqual([
      { uid: 'andy', times: 2 },
      { uid: 'sam', times: 2 },
    ])
  })

  it('counts who rode together once for each event, however often it was saved', () => {
    let memory = emptyMemory()
    for (let i = 0; i < 3; i++) {
      memory = withRide(memory, 'ev1_2026-11-01', '2026-11-01', [car('Van', 'a', ['b', 'c'])])
    }
    memory = withRide(memory, 'ev2_2026-11-08', '2026-11-08', [car('Van', 'a', ['b'])])
    const counts = togetherCounts(memory)
    expect(counts.get(pairKey('a', 'b'))).toBe(2)
    expect(counts.get(pairKey('b', 'c'))).toBe(1)
    // The event being arranged again: its own last arrangement isn't another time.
    expect(togetherCounts(memory, 'ev2_2026-11-08').get(pairKey('a', 'b'))).toBe(1)
  })

  it('keeps only the newest rides, and forgets an event whose cars were emptied', () => {
    let memory = emptyMemory()
    for (let d = 1; d <= MOST_RIDES + 5; d++) {
      const date = `2026-${String(Math.ceil(d / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`
      memory = withRide(memory, `ev_${d}`, date, [car('Van', 'a', ['b'])])
    }
    expect(Object.keys(memory.rides)).toHaveLength(MOST_RIDES)
    expect(memory.rides.ev_1).toBeUndefined()
    memory = withRide(memory, 'ev_45', '2026-02-17', [car('Van', '', [])])
    expect(memory.rides.ev_45).toBeUndefined()
  })

  it('reads anything that isn’t a memory as an empty one', () => {
    expect(memoryFrom(undefined)).toEqual(emptyMemory())
    expect(memoryFrom({ cars: 'no' })).toEqual(emptyMemory())
  })
})
