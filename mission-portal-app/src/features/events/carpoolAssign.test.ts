import { describe, expect, it } from 'vitest'
import {
  arrangementCost,
  autoAssign,
  driverToPick,
  familyName,
  pairKey,
  roomFor,
  type AssignCar,
  type AssignPerson,
} from './carpoolAssign'

const car = (id: string, seats: number, driver = '', children: string[] = []): AssignCar => ({
  id,
  label: id,
  seats,
  driver,
  children: children.map((name, i) => ({ id: `${id}k${i}`, name })),
})
const men = (...uids: string[]): AssignPerson[] => uids.map((uid) => ({ uid, sex: 'male' }))
const women = (...uids: string[]): AssignPerson[] => uids.map((uid) => ({ uid, sex: 'female' }))
const ridersOf = (cars: { id: string; riders: string[] }[], id: string) =>
  [...(cars.find((c) => c.id === id)?.riders ?? [])].sort()

describe('auto-assigning the cars', () => {
  it('seats everyone it can, never past what a car holds — its driver and children counted', () => {
    const cars = [car('van', 7, 'd1', ['Joey']), car('truck', 3, 'd2')]
    expect(cars.map(roomFor)).toEqual([5, 2])
    const people = [...men('d1', 'd2'), ...men('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')]
    const { cars: out, noRoom } = autoAssign({ cars, people, seed: 3 })
    expect(out[0].riders.length).toBeLessThanOrEqual(5)
    expect(out[1].riders.length).toBeLessThanOrEqual(2)
    expect(out[0].children).toEqual([{ id: 'vank0', name: 'Joey' }])
    // Eight to seat, seven seats: one left over, and said.
    expect(noRoom).toHaveLength(1)
    const seated = new Set([...out.flatMap((c) => c.riders), ...noRoom])
    expect(seated).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']))
  })

  it('never seats a driver as a rider, nor anyone left out', () => {
    const { cars, noRoom } = autoAssign({
      cars: [car('a', 5, 'd1'), car('b', 5, 'd2')],
      people: men('d1', 'd2', 'x', 'y', 'z'),
      leftOut: ['z'],
    })
    const riders = cars.flatMap((c) => c.riders).sort()
    expect(riders).toEqual(['x', 'y'])
    expect(noRoom).toEqual([])
  })

  it('keeps men with men and women with women, the driver counted', () => {
    const { cars } = autoAssign({
      cars: [car('his', 5, 'mDriver'), car('hers', 5, 'wDriver')],
      people: [...men('mDriver', 'm1', 'm2', 'm3'), ...women('wDriver', 'w1', 'w2', 'w3')],
      seed: 9,
    })
    expect(ridersOf(cars, 'his')).toEqual(['m1', 'm2', 'm3'])
    expect(ridersOf(cars, 'hers')).toEqual(['w1', 'w2', 'w3'])
  })

  it('fills no car while another has room: as evenly as their sizes allow', () => {
    const { cars } = autoAssign({
      cars: [car('a', 5, 'd1'), car('b', 5, 'd2')],
      people: men('d1', 'd2', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'),
    })
    expect(cars.map((c) => c.riders.length)).toEqual([3, 3])
  })

  it('mixes as little as it must when one car can’t take them all', () => {
    // Six men and a woman, two cars of five: the men can't all ride with the
    // man driving. The cars are no more mixed than they have to be, and
    // neither is full.
    const { cars, noRoom } = autoAssign({
      cars: [car('his', 5, 'mDriver'), car('hers', 5, 'wDriver')],
      people: [...men('mDriver', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'), ...women('wDriver', 'w1')],
      seed: 4,
    })
    expect(noRoom).toEqual([])
    expect(ridersOf(cars, 'hers')).toContain('w1')
    expect(cars.map((c) => c.riders.length).sort()).toEqual([3, 4])
  })

  it('keeps apart those who have ridden together before, where nothing else is lost', () => {
    const together = new Map([
      [pairKey('a', 'b'), 3],
      [pairKey('c', 'd'), 3],
    ])
    for (const seed of [1, 2, 3, 4, 5]) {
      const { cars } = autoAssign({
        cars: [car('x', 5, 'd1'), car('y', 5, 'd2')],
        people: men('d1', 'd2', 'a', 'b', 'c', 'd'),
        together,
        seed,
      })
      for (const c of cars) {
        expect(c.riders.includes('a') && c.riders.includes('b')).toBe(false)
        expect(c.riders.includes('c') && c.riders.includes('d')).toBe(false)
      }
    }
  })

  it('fills a car with no driver yet to every seat: its driver is one of those in it', () => {
    expect(roomFor(car('bus', 4))).toBe(4)
    const { cars, noRoom } = autoAssign({
      cars: [car('bus', 4)],
      people: men('a', 'b', 'c', 'd'),
    })
    expect(cars[0].riders).toHaveLength(4)
    expect(noRoom).toEqual([])
    expect(driverToPick(cars)).toBe('Pick a driver for bus from those in it.')
    expect(
      driverToPick([
        ...cars,
        { ...cars[0], id: 'van', label: 'Van' },
        { ...cars[0], id: 'x', label: '', riders: [] },
      ])
    ).toBe('Pick a driver for bus and Van from those in them.')
  })

  it('fills a car filled first before the others, men and women together where it may', () => {
    const van = { ...car('van', 15, 'vd'), mixedSex: true, fillFirst: true }
    const { cars, noRoom } = autoAssign({
      cars: [van, car('civic', 5, 'wd')],
      people: [...men('vd', 'm1', 'm2', 'm3', 'm4'), ...women('wd', 'w1', 'w2', 'w3')],
      seed: 5,
    })
    expect(noRoom).toEqual([])
    // Everyone rides in the van: the Civic goes with its driver alone.
    expect(ridersOf(cars, 'van')).toEqual(['m1', 'm2', 'm3', 'm4', 'w1', 'w2', 'w3'])
    expect(ridersOf(cars, 'civic')).toEqual([])
  })

  it('lets family — a shared last name — ride together whatever their sex', () => {
    expect(familyName('Sam Hart')).toBe('hart')
    expect(familyName('Cher')).toBe('')
    // The Harts in the man's car: no one is mixed, though he and she are both in it.
    const harts = autoAssign({
      cars: [car('a', 4, 'dad')],
      people: [
        { uid: 'dad', sex: 'male', family: 'hart' },
        { uid: 'mom', sex: 'female', family: 'hart' },
        { uid: 'son', sex: 'male', family: 'hart' },
      ],
    })
    const cost = arrangementCost(harts, [
      { uid: 'dad', sex: 'male', family: 'hart' },
      { uid: 'mom', sex: 'female', family: 'hart' },
      { uid: 'son', sex: 'male', family: 'hart' },
    ])
    const strangers = arrangementCost(harts, [
      { uid: 'dad', sex: 'male', family: 'hart' },
      { uid: 'mom', sex: 'female', family: 'ruiz' },
      { uid: 'son', sex: 'male', family: 'hart' },
    ])
    expect(strangers - cost).toBeGreaterThanOrEqual(6)
  })

  it('follows rules for people: either sex, kept together, kept apart', () => {
    // Ben may ride with women: he goes in the women's car rather than overfill the men's.
    const either = autoAssign({
      cars: [car('his', 3, 'm0'), car('hers', 5, 'w0')],
      people: [...men('m0', 'm1', 'm2', 'ben'), ...women('w0', 'w1')],
      rules: { eitherSex: new Set(['ben']) },
      seed: 2,
    })
    expect(either.noRoom).toEqual([])
    expect(ridersOf(either.cars, 'hers')).toContain('ben')

    const kept = autoAssign({
      cars: [car('x', 5, 'd1'), car('y', 5, 'd2')],
      people: men('d1', 'd2', 'a', 'b', 'c', 'd'),
      rules: { together: [['a', 'b']], apart: [['c', 'd']] },
    })
    for (const c of kept.cars) {
      expect(c.riders.includes('a')).toBe(c.riders.includes('b'))
      expect(c.riders.includes('c') && c.riders.includes('d')).toBe(false)
    }
  })

  it('gives the same arrangement for the same seed, and one no worse for another', () => {
    const input = {
      cars: [car('a', 5, 'd1'), car('b', 6, 'd2'), car('c', 4, 'd3')],
      people: [...men('d1', 'd2', 'p1', 'p2', 'p3', 'p4'), ...women('d3', 'q1', 'q2', 'q3')],
    }
    const first = autoAssign({ ...input, seed: 11 })
    expect(autoAssign({ ...input, seed: 11 })).toEqual(first)
    const best = arrangementCost(first, input.people)
    const other = autoAssign({ ...input, seed: 12 })
    expect(Math.abs(arrangementCost(other, input.people) - best)).toBeLessThan(1)
  })
})
