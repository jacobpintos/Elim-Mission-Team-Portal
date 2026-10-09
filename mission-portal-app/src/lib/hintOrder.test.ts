import { describe, expect, it } from 'vitest'
import { hasForeignWord, orderForHints, upcomingSheetIds } from './hintOrder'

describe('hasForeignWord', () => {
  it('spots the titles recognition cannot spell unaided', () => {
    expect(hasForeignWord('Agnus Dei')).toBe(true)
    expect(hasForeignWord('Hosanna (Praise Is Rising)')).toBe(true)
    expect(hasForeignWord('Abba (Arms of a Father)')).toBe(true)
    expect(hasForeignWord('Santo, Santo, Santo')).toBe(true)
    expect(hasForeignWord('Señor')).toBe(true)
    expect(hasForeignWord('All Hail King Jesus')).toBe(false)
    expect(hasForeignWord('Way Maker')).toBe(false)
  })
})

describe('upcomingSheetIds', () => {
  const lists = [
    { eventDate: '2026-10-11', songs: [{ chordSheetId: 'a' }, { chordSheetId: null }] },
    { eventDate: '2026-10-30', songs: [{ chordSheetId: 'far' }] },
    { eventDate: '2026-10-01', songs: [{ chordSheetId: 'past' }] },
    { eventDate: null, songs: [{ chordSheetId: 'undated' }] },
    { eventDate: '2026-10-23', songs: [{ chordSheetId: 7 }] },
  ]
  it('takes the songs of set lists in the next two weeks', () => {
    expect([...upcomingSheetIds(lists, '2026-10-09')].sort()).toEqual(['7', 'a'])
  })
})

describe('orderForHints', () => {
  it('puts songs it has been corrected to before upcoming ones', () => {
    const sheets = [
      { id: 1, title: 'Way Maker' },
      { id: 2, title: 'Build My Life' },
    ]
    expect(orderForHints(sheets, new Set(['2']), new Set(['1'])).map((s) => s.id)).toEqual([1, 2])
  })

  it('puts foreign titles first, then upcoming songs, then the rest alphabetically', () => {
    const sheets = [
      { id: 1, title: 'Way Maker' },
      { id: 2, title: 'Build My Life' },
      { id: 3, title: 'Agnus Dei' },
      { id: 4, title: 'Goodness of God' },
    ]
    expect(orderForHints(sheets, new Set(['4'])).map((s) => s.title)).toEqual([
      'Agnus Dei',
      'Goodness of God',
      'Build My Life',
      'Way Maker',
    ])
  })
})
