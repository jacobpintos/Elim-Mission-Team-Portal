import { describe, it, expect } from 'vitest'
import { balancedRows, chunkIntoRows } from './gridRows'

describe('balancedRows', () => {
  it('puts five across four columns as three and two', () => {
    // The arrangement this exists for: a plain wrap gives 4 and a stranded 1.
    expect(balancedRows(5, 4)).toEqual([3, 2])
  })

  it('leaves a row that already fits alone', () => {
    expect(balancedRows(4, 4)).toEqual([4])
    expect(balancedRows(1, 4)).toEqual([1])
    expect(balancedRows(3, 4)).toEqual([3])
  })

  it('evens out the rows it does need', () => {
    expect(balancedRows(6, 4)).toEqual([3, 3])
    expect(balancedRows(7, 4)).toEqual([4, 3])
    expect(balancedRows(8, 4)).toEqual([4, 4])
    expect(balancedRows(9, 4)).toEqual([3, 3, 3])
    expect(balancedRows(10, 4)).toEqual([4, 3, 3])
  })

  it('never makes one row more than one taller than another', () => {
    for (let n = 1; n <= 40; n++) {
      for (const max of [2, 3, 4]) {
        const rows = balancedRows(n, max)
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('always accounts for everyone, and never overfills a row', () => {
    for (let n = 1; n <= 40; n++) {
      for (const max of [2, 3, 4]) {
        const rows = balancedRows(n, max)
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n)
        expect(Math.max(...rows)).toBeLessThanOrEqual(max)
      }
    }
  })

  it('uses the fewest rows that will hold them', () => {
    for (let n = 1; n <= 40; n++) {
      for (const max of [2, 3, 4]) {
        expect(balancedRows(n, max)).toHaveLength(Math.ceil(n / max))
      }
    }
  })

  it('has nothing to arrange for an empty team', () => {
    expect(balancedRows(0, 4)).toEqual([])
    expect(balancedRows(5, 0)).toEqual([])
  })
})

describe('chunkIntoRows', () => {
  it('deals the people out in order', () => {
    expect(chunkIntoRows(['a', 'b', 'c', 'd', 'e'], 4)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ])
  })

  it('stacks two to a row on a narrow screen', () => {
    expect(chunkIntoRows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('loses nobody', () => {
    const team = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(chunkIntoRows(team, 4).flat()).toEqual(team)
  })
})
