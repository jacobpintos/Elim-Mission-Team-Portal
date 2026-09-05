import { describe, it, expect } from 'vitest'
import {
  matchesQuery,
  searchMusic,
  scopeLabel,
  SEARCH_SCOPES,
  DEFAULT_SCOPE,
  type SearchableItem,
} from './musicSearch'

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

describe('matchesQuery: the default scope', () => {
  it('searches titles', () => {
    expect(matchesQuery(oneness, 'oneness')).toBe(true)
    expect(matchesQuery(oneness, 'ONENESS')).toBe(true)
  })

  it('looks nowhere else, which is the point of a default of titles', () => {
    // All true under 'all', all false here.
    expect(matchesQuery(oneness, 'narrative')).toBe(false)
    expect(matchesQuery(oneness, 'sunny')).toBe(false)
    expect(matchesQuery(mothersTouch, '2021')).toBe(false)
  })

  it('requires every word, so a search narrows rather than widens', () => {
    expect(matchesQuery(oneness, 'oneness unity')).toBe(true)
    expect(matchesQuery(oneness, 'oneness revival')).toBe(false)
  })

  it('is the scope used when none is given', () => {
    expect(DEFAULT_SCOPE).toBe('title')
  })
})

describe('matchesQuery: field scopes', () => {
  it('searches the album or series', () => {
    expect(matchesQuery(oneness, 'narrative', 'album')).toBe(true)
    expect(matchesQuery(oneness, 'oneness', 'album')).toBe(false)
  })

  it('searches the year', () => {
    expect(matchesQuery(mothersTouch, '2021', 'year')).toBe(true)
    expect(matchesQuery(mothersTouch, '2026', 'year')).toBe(false)
  })

  it('searches host, guest and preacher together', () => {
    expect(matchesQuery(oneness, 'sunny', 'people')).toBe(true)
    expect(matchesQuery(oneness, 'reece', 'people')).toBe(true)
    expect(matchesQuery(sermon, 'ajai', 'people')).toBe(true)
    expect(matchesQuery(sermon, 'sunny', 'people')).toBe(false)
  })

  it('lets Everything draw words from different fields', () => {
    expect(matchesQuery(oneness, 'reece oneness', 'all')).toBe(true)
    expect(matchesQuery(oneness, 'narrative 2026', 'all')).toBe(true)
  })

  it('survives an item with the searched field missing', () => {
    expect(matchesQuery(sermon, 'anything', 'album')).toBe(false)
    expect(matchesQuery({ title: 'Untitled', type: 'music' }, 'x', 'year')).toBe(false)
  })
})

describe('matchesQuery: kind scopes', () => {
  it('keeps only that kind', () => {
    expect(matchesQuery(oneness, '', 'podcast')).toBe(true)
    expect(matchesQuery(mothersTouch, '', 'podcast')).toBe(false)
    expect(matchesQuery(sermon, '', 'sermon')).toBe(true)
  })

  it('searches titles within the kind', () => {
    expect(matchesQuery(oneness, 'unity', 'podcast')).toBe(true)
    expect(matchesQuery(oneness, 'narrative', 'podcast')).toBe(false)
  })

  it('will not match the right title in the wrong kind', () => {
    expect(matchesQuery(mothersTouch, 'mother', 'sermon')).toBe(false)
  })
})

describe('searchMusic', () => {
  it('keeps the library in its given order', () => {
    expect(searchMusic(library, 'revival')).toEqual([sermon])
  })

  it('returns the whole library when nothing is typed in a field scope', () => {
    expect(searchMusic(library, '')).toBe(library)
    expect(searchMusic(library, '   ', 'album')).toBe(library)
  })

  it('narrows to a kind even with nothing typed', () => {
    // What makes "Podcasts only" worth choosing on its own.
    expect(searchMusic(library, '', 'podcast')).toEqual([oneness])
    expect(searchMusic(library, '', 'music')).toEqual([mothersTouch])
  })

  it('returns nothing rather than everything when there is no match', () => {
    expect(searchMusic(library, 'zzzz')).toEqual([])
  })
})

describe('scope labels', () => {
  it('names every scope offered', () => {
    expect(SEARCH_SCOPES).toHaveLength(8)
    for (const scope of SEARCH_SCOPES) {
      expect(scopeLabel(scope.value)).toBe(scope.label)
    }
  })
})
