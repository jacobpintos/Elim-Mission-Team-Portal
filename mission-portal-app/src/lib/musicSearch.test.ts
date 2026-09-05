import { describe, it, expect } from 'vitest'
import { matchesQuery, searchMusic, type SearchableItem } from './musicSearch'

const oneness: SearchableItem = {
  title: 'Oneness Vs Unity - Pastor Scott Reece',
  type: 'podcast',
  album: 'Flip The Narrative',
  host: 'Sunny Singh',
  guest: 'Pastor Scott Reece',
  year: 2026,
}

const mothersTouch: SearchableItem = {
  title: "A Mother's Touch - Feat. Austin Hoffon",
  type: 'music',
  album: 'EP',
  year: 2021,
}

const sermon: SearchableItem = {
  title: 'Revival Now',
  type: 'sermon',
  preacher: 'Ajai Prakash',
  year: 2024,
}

const library = [oneness, mothersTouch, sermon]

describe('matchesQuery', () => {
  it('finds a video by words in its title', () => {
    expect(matchesQuery(oneness, 'oneness')).toBe(true)
    expect(matchesQuery(oneness, 'unity')).toBe(true)
  })

  it('ignores case', () => {
    expect(matchesQuery(oneness, 'ONENESS')).toBe(true)
  })

  it('searches the series, the people and the year', () => {
    expect(matchesQuery(oneness, 'flip the narrative')).toBe(true)
    expect(matchesQuery(oneness, 'sunny')).toBe(true)
    expect(matchesQuery(sermon, 'ajai')).toBe(true)
    expect(matchesQuery(mothersTouch, '2021')).toBe(true)
  })

  it('lets words come from different fields and in any order', () => {
    // How someone half-remembers a video: a word of the title and a name.
    expect(matchesQuery(oneness, 'reece oneness')).toBe(true)
    expect(matchesQuery(oneness, 'narrative 2026')).toBe(true)
  })

  it('requires every word, so a search narrows rather than widens', () => {
    expect(matchesQuery(oneness, 'oneness sermon')).toBe(false)
  })

  it('finds things by what kind they are', () => {
    expect(matchesQuery(oneness, 'podcast')).toBe(true)
    expect(matchesQuery(sermon, 'message')).toBe(true)
    expect(matchesQuery(mothersTouch, 'song')).toBe(true)
    expect(matchesQuery(mothersTouch, 'podcast')).toBe(false)
  })

  it('matches everything on an empty search', () => {
    expect(matchesQuery(mothersTouch, '')).toBe(true)
    expect(matchesQuery(mothersTouch, '   ')).toBe(true)
  })

  it('survives an item with almost nothing filled in', () => {
    expect(matchesQuery({ title: 'Untitled', type: 'music' }, 'untitled')).toBe(true)
    expect(matchesQuery({ title: 'Untitled', type: 'music' }, 'reece')).toBe(false)
  })
})

describe('searchMusic', () => {
  it('keeps the library in its given order', () => {
    expect(searchMusic(library, '2026')).toEqual([oneness])
    expect(searchMusic(library, 'e')).toEqual(library)
  })

  it('returns the whole library when nothing is typed', () => {
    expect(searchMusic(library, '')).toBe(library)
  })

  it('returns nothing rather than everything when there is no match', () => {
    expect(searchMusic(library, 'zzzz')).toEqual([])
  })
})
