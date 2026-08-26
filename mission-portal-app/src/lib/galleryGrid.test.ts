import { describe, it, expect } from 'vitest'
import {
  clampColumns,
  toRows,
  setLinkAt,
  remapLinks,
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

describe('setLinkAt', () => {
  it('fills the gap before a link set on a later picture', () => {
    // The third picture is linked and the first two are not, so the array has
    // to be long enough to put the link at index 2.
    expect(setLinkAt([], 2, 'https://example.com')).toEqual(['', '', 'https://example.com'])
  })

  it('stores nothing for a gallery whose links are all cleared', () => {
    expect(setLinkAt(['https://example.com'], 0, '')).toEqual([])
    expect(setLinkAt(['https://a.test', 'https://b.test'], 1, '  ')).toEqual(['https://a.test'])
  })

  it('trims what was typed', () => {
    expect(setLinkAt([], 0, '  https://example.com ')).toEqual(['https://example.com'])
  })
})

describe('remapLinks', () => {
  const a = 'https://img/a.png'
  const b = 'https://img/b.png'
  const c = 'https://img/c.png'

  it('follows a picture that moved', () => {
    expect(remapLinks([a, b], ['https://a.link', ''], [b, a])).toEqual(['', 'https://a.link'])
  })

  it('does not slide links up when a picture above is deleted', () => {
    // The bug this exists to prevent: dropping `a` would otherwise leave b's
    // link on c.
    expect(remapLinks([a, b, c], ['', 'https://b.link', ''], [b, c])).toEqual(['https://b.link'])
  })

  it('leaves a newly added picture unlinked', () => {
    expect(remapLinks([a], ['https://a.link'], [a, b])).toEqual(['https://a.link'])
  })

  it('drops the link when the address itself is edited', () => {
    // Nothing ties the old link to the new address, and guessing would leave
    // it on a picture nobody chose it for.
    expect(remapLinks([a], ['https://a.link'], [c])).toEqual([])
  })
})
