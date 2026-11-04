import { describe, expect, it } from 'vitest'
import { ELIM_VAN } from '../vehicles/elimVan'
import type { Vehicle } from '../vehicles/types'
import { driversFor, planVehicles, type PlanPerson } from './planVehicles'

const men = (...uids: string[]): PlanPerson[] => uids.map((uid) => ({ uid, sex: 'male' }))
const women = (...uids: string[]): PlanPerson[] => uids.map((uid) => ({ uid, sex: 'female' }))
const vehicle = (
  id: string,
  seats: number,
  drivers: string[],
  trailer: Vehicle['trailer'] = 'none'
): Vehicle => ({ id, name: id, seats, drivers, trailer })
const NO_TRAILERS = { small: false, big: false }
const ids = (plan: { vehicles: { vehicle: Vehicle }[] }) =>
  plan.vehicles.map((v) => v.vehicle.id).sort()

// The team in the mockup: 10 men and 9 women going.
const team = [
  ...men('andy', 'sam', 'dan', 'tom', 'ben', 'carl', 'gus', 'eli', 'nate', 'luis'),
  ...women('maria', 'beth', 'emily', 'fay', 'grace', 'hana', 'ivy', 'jo', 'kate'),
]
const fleet = [
  vehicle('odyssey', 7, ['andy']),
  vehicle('f150', 5, ['sam'], 'both'),
  vehicle('corolla', 5, ['dan']),
  vehicle('sienna', 8, ['maria'], 'small'),
  vehicle('civic', 5, ['beth']),
  { ...ELIM_VAN, drivers: [] },
]

describe('planning a carpool from the vehicles', () => {
  it('keeps men with men and women with women before it saves a vehicle', () => {
    // Without the van, no one car holds the 10 men or the 9 women: two cars
    // each, four in all, keep them apart — fewer would mix them.
    const plan = planVehicles({ vehicles: fleet, people: team, trailers: NO_TRAILERS })
    expect(plan.mixed).toBe(0)
    expect(plan.noRoom).toEqual([])
    // Women: the Sienna (8) and the Civic (5); men: the Odyssey (7) and one 5-seater.
    expect(ids(plan)).toContain('sienna')
    expect(ids(plan)).toContain('civic')
    expect(ids(plan)).toContain('odyssey')
    expect(plan.vehicles).toHaveLength(4)
    for (const car of plan.cars) {
      const sexes = new Set(
        [car.driver, ...car.riders].map((u) => team.find((p) => p.uid === u)!.sex)
      )
      expect(sexes.size).toBe(1)
    }
  })

  it('brings as few vehicles as it can once the sexes are kept apart, cars full or not', () => {
    // Everyone a man: the van alone holds the 10, not two cars with room to spare.
    const plan = planVehicles({
      vehicles: fleet,
      people: men('andy', 'sam', 'dan', 'tom', 'ben', 'carl', 'gus', 'eli', 'nate', 'luis'),
      trailers: NO_TRAILERS,
      bring: { [ELIM_VAN.id]: true },
    })
    expect(ids(plan)).toEqual(['elim-van'])
    // And with a car full, the next to bring is offered.
    const tight = planVehicles({
      vehicles: fleet,
      people: men('andy', 'sam', 'ben', 'carl', 'gus', 'eli', 'nate'),
      trailers: NO_TRAILERS,
    })
    expect(ids(tight)).toEqual(['odyssey'])
    expect(tight.full).toEqual(['odyssey'])
    expect(tight.offer?.id).toBe('f150')
  })

  it('asks before the Elim Van comes, and lets anyone who drives another vehicle drive it', () => {
    const going = new Set(['sam', 'beth', 'x'])
    expect(driversFor(ELIM_VAN, fleet, going, new Set()).sort()).toEqual(['beth', 'sam'])
    const people = [...men('sam', 'a', 'b', 'c', 'd', 'e', 'f')]
    const without = planVehicles({ vehicles: fleet, people, trailers: NO_TRAILERS })
    expect(ids(without)).toEqual(['f150'])
    expect(without.left).toContainEqual({ vehicle: fleet[5], why: 'not brought' })
    const withVan = planVehicles({
      vehicles: fleet,
      people,
      trailers: NO_TRAILERS,
      bring: { [ELIM_VAN.id]: true },
    })
    // Sam drives the van (Sam's own truck isn't needed), and everyone fits.
    expect(ids(withVan)).toEqual(['elim-van'])
    expect(withVan.vehicles[0].driver).toBe('sam')
    expect(withVan.noRoom).toEqual([])
  })

  it('takes the vehicle of a driver who is going, when its owner isn’t', () => {
    const borrowed = vehicle('suburban', 8, ['owner', 'kim'])
    const plan = planVehicles({
      vehicles: [borrowed],
      people: men('kim', 'p1', 'p2', 'p3'),
      trailers: NO_TRAILERS,
    })
    expect(plan.vehicles[0].driver).toBe('kim')
  })

  it('puts each trailer behind a vehicle that can pull it', () => {
    const big = planVehicles({
      vehicles: fleet,
      people: men('andy', 'sam', 'a', 'b'),
      trailers: { small: false, big: true },
    })
    expect(big.vehicles.find((v) => v.trailer === 'big')?.vehicle.id).toBe('f150')

    const both = planVehicles({
      vehicles: fleet,
      people: [...men('sam', 'a'), ...women('maria', 'w1')],
      trailers: { small: true, big: true },
    })
    expect(both.vehicles.find((v) => v.trailer === 'big')?.vehicle.id).toBe('f150')
    expect(both.vehicles.find((v) => v.trailer === 'small')?.vehicle.id).toBe('sienna')
    expect(both.problems).toEqual([])
  })

  it('says when no vehicle going can pull a trailer, and plans the seats anyway', () => {
    const plan = planVehicles({
      vehicles: fleet,
      people: men('andy', 'a', 'b'),
      trailers: { small: false, big: true },
    })
    expect(plan.problems).toEqual(['No vehicle with a driver going can pull the big trailer.'])
    expect(plan.noRoom).toEqual([])
  })

  it('finds another driver when one can’t drive this time — and they ride', () => {
    const shared = vehicle('bus', 12, ['tom', 'andy'])
    const people = men('tom', 'andy', 'a', 'b', 'c')
    const first = planVehicles({ vehicles: [shared], people, trailers: NO_TRAILERS, seed: 3 })
    const driver = first.vehicles[0].driver
    const other = driver === 'tom' ? 'andy' : 'tom'
    const again = planVehicles({
      vehicles: [shared],
      people,
      trailers: NO_TRAILERS,
      cantDrive: [driver],
    })
    expect(again.vehicles[0].driver).toBe(other)
    expect(again.cars[0].riders).toContain(driver)
  })

  it('brings a vehicle added by hand, or with children in it', () => {
    const plan = planVehicles({
      vehicles: fleet,
      people: men('andy', 'sam', 'a'),
      trailers: NO_TRAILERS,
      add: ['f150'],
      children: { odyssey: [{ id: 'k1', name: 'Joey' }] },
    })
    expect(ids(plan)).toEqual(['f150', 'odyssey'])
    expect(plan.cars.find((c) => c.id === 'odyssey')?.children).toEqual([
      { id: 'k1', name: 'Joey' },
    ])
  })

  it('seats as many as it can when there aren’t seats enough, and says who is left', () => {
    const plan = planVehicles({
      vehicles: [vehicle('car', 4, ['a'])],
      people: men('a', 'b', 'c', 'd', 'e', 'f'),
      trailers: NO_TRAILERS,
    })
    expect(plan.cars[0].riders).toHaveLength(3)
    expect(plan.noRoom).toHaveLength(2)
    expect(plan.offer).toBeNull()
  })

  it('says so when no vehicle has a driver going, or there are none', () => {
    expect(
      planVehicles({
        vehicles: [vehicle('car', 4, ['nobody'])],
        people: men('a'),
        trailers: NO_TRAILERS,
      }).problems
    ).toEqual(['No vehicle has a driver going.'])
    expect(
      planVehicles({ vehicles: [], people: men('a'), trailers: NO_TRAILERS }).problems
    ).toEqual(['No vehicles yet — add them in Admin → Vehicles.'])
  })
})
