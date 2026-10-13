import { describe, expect, it } from 'vitest'
import type { CarpoolCarData } from '@/types/events'
import {
  cardColorsFor,
  CARD_COLORS,
  carName,
  childNames,
  headCount,
  matchesSearch,
  moveTo,
  newCar,
  newChild,
  spotOf,
  tidyCars,
  unplaced,
} from './carpoolCards'

const car = (id: string, driver = '', riders: string[] = [], extra: Partial<CarpoolCarData> = {}) =>
  ({ id, label: '', driver, riders, ...extra }) as CarpoolCarData

describe('carpool cards', () => {
  it('colours a card blue for male, pink for female, and leaves the rest to the theme', () => {
    expect(cardColorsFor('male')).toBe(CARD_COLORS.male)
    expect(cardColorsFor('female')).toBe(CARD_COLORS.female)
    expect(cardColorsFor(undefined)).toBeNull()
    expect(cardColorsFor(null)).toBeNull()
  })

  it('says where someone is', () => {
    const cars = [car('a', 'dan', ['sam']), car('b', '', ['ann'])]
    expect(spotOf(cars, 'dan')).toEqual({ kind: 'driver', carId: 'a' })
    expect(spotOf(cars, 'ann')).toEqual({ kind: 'passenger', carId: 'b' })
    expect(spotOf(cars, 'joe')).toEqual({ kind: 'pool' })
  })

  it('puts someone from the pool into a seat', () => {
    const cars = [car('a')]
    expect(moveTo(cars, 'sam', { kind: 'driver', carId: 'a' })[0].driver).toBe('sam')
    expect(moveTo(cars, 'sam', { kind: 'passenger', carId: 'a' })[0].riders).toEqual(['sam'])
  })

  it('takes them out of where they were, so no one is in two places', () => {
    const cars = [car('a', 'dan', ['sam']), car('b')]
    const next = moveTo(cars, 'sam', { kind: 'passenger', carId: 'b' })
    expect(next[0].riders).toEqual([])
    expect(next[1].riders).toEqual(['sam'])
    const back = moveTo(next, 'dan', { kind: 'pool' })
    expect(back[0].driver).toBe('')
    expect(unplaced(back, ['dan', 'sam', 'joe'])).toEqual(['dan', 'joe'])
  })

  it('sends a driver bumped by someone from the pool back to the pool', () => {
    const next = moveTo([car('a', 'dan')], 'sam', { kind: 'driver', carId: 'a' })
    expect(next[0].driver).toBe('sam')
    expect(spotOf(next, 'dan')).toEqual({ kind: 'pool' })
  })

  it('swaps a passenger moved into the driver’s seat with the driver', () => {
    const next = moveTo([car('a', 'dan', ['sam', 'ann'])], 'sam', { kind: 'driver', carId: 'a' })
    expect(next[0].driver).toBe('sam')
    expect(next[0].riders).toEqual(['ann', 'dan'])
  })

  it('swaps drivers between cars', () => {
    const next = moveTo([car('a', 'dan'), car('b', 'eve')], 'dan', { kind: 'driver', carId: 'b' })
    expect(next[0].driver).toBe('eve')
    expect(next[1].driver).toBe('dan')
  })

  it('moves a driver into their own car’s passengers, leaving it with no driver', () => {
    const next = moveTo([car('a', 'dan', ['sam'])], 'dan', { kind: 'passenger', carId: 'a' })
    expect(next[0].driver).toBe('')
    expect(next[0].riders).toEqual(['sam', 'dan'])
  })

  it('leaves the cars as they were when someone is dropped where they already are', () => {
    const cars = [car('a', 'dan', ['sam'])]
    expect(moveTo(cars, 'sam', { kind: 'passenger', carId: 'a' })).toBe(cars)
    expect(moveTo(cars, 'dan', { kind: 'driver', carId: 'a' })).toBe(cars)
    expect(moveTo(cars, 'joe', { kind: 'pool' })).toBe(cars)
  })

  it('keeps children where they are when the grown-ups move', () => {
    const kids = [{ id: 'k1', name: 'Joey' }]
    const next = moveTo([car('a', 'dan', [], { children: kids })], 'dan', { kind: 'pool' })
    expect(next[0].children).toEqual(kids)
    expect(headCount(next[0])).toBe(1)
  })

  it('counts a car’s driver, passengers and children', () => {
    expect(headCount(car('a', 'dan', ['sam'], { children: [{ id: 'k', name: '' }] }))).toBe(3)
    expect(headCount(car('a'))).toBe(0)
  })

  it('names a car by its name, or its place in the list', () => {
    expect(carName(car('a', '', [], { label: ' Andy’s van ' }), 0)).toBe('Andy’s van')
    expect(carName(car('a'), 2)).toBe('Car 3')
  })

  it('gives new cars and children ids that do not clash', () => {
    const first = newCar([])
    const second = newCar([first])
    expect(second.id).not.toBe(first.id)
    const withKid = { ...first, children: [newChild(first)] }
    expect(newChild(withKid).id).not.toBe(withKid.children[0].id)
  })

  it('tidies the cars for saving, with nothing Firestore would refuse', () => {
    const tidy = tidyCars([
      car('a', 'dan', ['sam', ''], {
        label: '  Van ',
        children: [{ id: 'k', name: ' Joey ' }],
      }),
      car('b'),
    ])
    expect(tidy[0]).toEqual({
      id: 'a',
      label: 'Van',
      driver: 'dan',
      riders: ['sam'],
      children: [{ id: 'k', name: 'Joey' }],
    })
    // No empty list of children, and no undefined anywhere.
    expect(tidy[1]).toEqual({ id: 'b', label: '', driver: '', riders: [] })
    expect(JSON.stringify(tidy)).not.toContain('undefined')
  })

  it('keeps the seats a car was given', () => {
    expect(tidyCars([car('a', '', [], { seats: 7 })])[0].seats).toBe(7)
  })

  it('lists children by name, or as a child when not named yet', () => {
    expect(
      childNames(
        car('a', '', [], {
          children: [
            { id: '1', name: 'Joey' },
            { id: '2', name: ' ' },
          ],
        })
      )
    ).toEqual(['Joey (child)', 'a child'])
    expect(childNames(car('a'))).toEqual([])
  })

  it('finds someone by any part of their name, as it is typed', () => {
    for (const q of ['j', 'jac', 'JACOB', 'pintos', 'jac pin', 'pin jac', '  jacob   pintos ']) {
      expect(matchesSearch('Jacob Pintos', q)).toBe(true)
    }
    expect(matchesSearch('Jacob Pintos', 'jacob smith')).toBe(false)
    expect(matchesSearch('José Núñez', 'jose nunez')).toBe(true)
    expect(matchesSearch('Anyone', '')).toBe(true)
  })
})
