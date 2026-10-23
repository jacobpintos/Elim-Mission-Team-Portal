import { describe, it, expect } from 'vitest'
import { activeSale, endOfDay, readSale, saleEndsLabel, type StoreSale } from './storeSale'

const sale = (over: Partial<StoreSale>): StoreSale => ({
  id: 's',
  message: '20% off shirts',
  endsOn: '2026-11-01',
  endsAt: endOfDay('2026-11-01'),
  createdAt: 0,
  ...over,
})

// A Friday afternoon, local time.
const NOW = new Date(2026, 9, 23, 15, 0)

describe('endOfDay', () => {
  it('is the last moment of that day here', () => {
    const end = new Date(endOfDay('2026-11-01'))
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 10, 1])
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59])
  })
})

describe('activeSale', () => {
  it('shows a sale until its last day is over', () => {
    const s = sale({})
    expect(activeSale([s], NOW.getTime())?.id).toBe('s')
    expect(activeSale([s], new Date(2026, 10, 1, 22, 0).getTime())?.id).toBe('s')
    expect(activeSale([s], new Date(2026, 10, 2, 0, 1).getTime())).toBeNull()
  })

  it('shows the newest of several', () => {
    const got = activeSale(
      [sale({ id: 'old', createdAt: 1 }), sale({ id: 'new', createdAt: 2 })],
      NOW.getTime()
    )
    expect(got?.id).toBe('new')
  })

  it('skips one with no message', () => {
    expect(activeSale([sale({ message: '  ' })], NOW.getTime())).toBeNull()
  })
})

describe('saleEndsLabel', () => {
  it('says today and tomorrow when it is that close', () => {
    expect(saleEndsLabel('2026-10-23', NOW)).toBe('Ends today')
    expect(saleEndsLabel('2026-10-24', NOW)).toBe('Ends tomorrow')
  })

  it('names the day otherwise', () => {
    expect(saleEndsLabel('2026-11-01', NOW)).toBe('Ends Sunday, November 1')
  })

  it('adds the year when it is not this one', () => {
    expect(saleEndsLabel('2027-01-03', NOW)).toBe('Ends Sunday, January 3, 2027')
  })
})

describe('readSale', () => {
  it('reads a message and an MM/DD/YY date', () => {
    const got = readSale('Half off hats', '11/01/26', NOW)
    expect(got).toEqual({ endsOn: '2026-11-01', endsAt: endOfDay('2026-11-01') })
  })

  it('takes a sale ending today', () => {
    expect('endsOn' in readSale('Today only', '10/23/26', NOW)).toBe(true)
  })

  it('wants a message', () => {
    expect(readSale(' ', '11/01/26', NOW)).toEqual({ error: 'Write the sale message.' })
  })

  it('refuses a date it cannot read, or one that is not a real day', () => {
    expect('error' in readSale('Sale', 'next friday', NOW)).toBe(true)
    expect('error' in readSale('Sale', '02/31/27', NOW)).toBe(true)
  })

  it('refuses a last day already past', () => {
    expect(readSale('Sale', '10/22/26', NOW)).toEqual({
      error: 'The last day of the sale has already passed.',
    })
  })
})
