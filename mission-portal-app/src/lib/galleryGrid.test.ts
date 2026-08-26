import { describe, it, expect } from 'vitest'
import {
  clampColumns,
  toRows,
  DEFAULT_COLUMNS,
  MIN_COLUMNS,
  MAX_COLUMNS,
} from './galleryGrid'

describe('clampColumns', () => {
  it('keeps a sensible count', () => {
    expect(clampColumns(2)).toBe(2)
    expect(clampColumns(3)).toBe(3)
  })

  it('falls back when unset', () => {
    expect(clampColumns(undefined)).toBe(DEFAULT_COLUMNS)
    expect(clampColumns(0)).toBe(DEFAULT_COLUMNS)
    expect(clampColumns(Number.NaN)).toBe(DEFAULT_COLUMNS)
  })

  it('will not lay out a grid that cannot be drawn', () => {
    // Zero or negative columns divides the row width by nothing.
    expect(clampColumns(-4)).toBe(MIN_COLUMNS)
    expect(clampColumns(99)).toBe(MAX_COLUMNS)
  })
})

describe('toRows', () => {
  it('fills rows in order', () => {
    expect(toRows(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('leaves a short last row short rather than padding it', () => {
    // Padding would render empty cells the reader can tap.
    expect(toRows(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']])
  })

  it('handles one column and an empty list', () => {
    expect(toRows(['a', 'b'], 1)).toEqual([['a'], ['b']])
    expect(toRows([], 2)).toEqual([])
  })
})
