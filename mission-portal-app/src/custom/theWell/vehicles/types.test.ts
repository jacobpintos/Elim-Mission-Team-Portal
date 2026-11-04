import { describe, expect, it } from 'vitest'
import { ELIM_VAN_ID } from './elimVan'
import { canPull, vehicleData, vehicleFrom } from './types'

describe('a vehicle as kept', () => {
  it('reads what was kept, and what is missing as it means when absent', () => {
    expect(
      vehicleFrom('odyssey', { name: ' Odyssey ', seats: '7', drivers: ['a', 'a', 3] })
    ).toEqual({
      id: 'odyssey',
      name: 'Odyssey',
      seats: 7,
      drivers: ['a', '3'],
      trailer: 'none',
    })
    expect(vehicleFrom('x', undefined)).toMatchObject({ name: 'Unnamed vehicle', seats: 5 })
  })

  it('keeps the Elim Van for men and women together, and filled first, until an admin says not', () => {
    expect(vehicleFrom(ELIM_VAN_ID, { name: 'Elim Van', seats: 15 })).toMatchObject({
      mixedSex: true,
      fillFirst: true,
    })
    expect(
      vehicleFrom(ELIM_VAN_ID, { name: 'Elim Van', seats: 15, mixedSex: false, fillFirst: false })
    ).not.toHaveProperty('mixedSex')
    expect(vehicleFrom('odyssey', { name: 'Odyssey' })).not.toHaveProperty('fillFirst')
    expect(
      vehicleData({ id: 'v', name: 'V', seats: 5, drivers: [], trailer: 'small', mixedSex: true })
    ).toMatchObject({
      mixedSex: true,
      fillFirst: false,
    })
  })

  it('pulls the big trailer only when it can pull both', () => {
    expect(canPull({ trailer: 'both' }, 'big')).toBe(true)
    expect(canPull({ trailer: 'small' }, 'big')).toBe(false)
    expect(canPull({ trailer: 'small' }, 'small')).toBe(true)
    expect(canPull({ trailer: 'none' }, 'small')).toBe(false)
  })
})
