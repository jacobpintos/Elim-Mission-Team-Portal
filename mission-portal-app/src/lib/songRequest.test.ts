import { describe, expect, it } from 'vitest'
import {
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  soundOf,
  splitSpokenKey,
  spokenKey,
  trailingKey,
} from './songRequest'

const sheets = [
  { id: 1, title: 'Firm Foundation (He Won’t)' },
  { id: 2, title: 'Holy' },
  { id: 3, title: 'Holy Forever' },
  { id: 4, title: 'Build My Life' },
  { id: 5, title: 'King of Kings' },
  { id: 6, title: 'Agnus Dei' },
  { id: 7, title: '10,000 Reasons (Ten Thousand Reasons)' },
  { id: 8, title: 'Abba (Arms of a Father)' },
  { id: 9, title: 'All Hail King Jesus' },
  { id: 10, title: 'Mighty to Save' },
  { id: 11, title: 'Son of Suffering' },
]
const ask = (text: string) => {
  const r = parseSongRequest(sheets, text)
  return r ? { id: r.sheet.id, key: r.key, minor: r.minor } : null
}

describe('soundOf', () => {
  it('hears alike what sounds alike', () => {
    expect(soundOf('agnus')).toBe(soundOf('agnes'))
    expect(soundOf('dei')).toBe(soundOf('day'))
    expect(soundOf('phone')).toBe(soundOf('fone'))
    expect(soundOf('grace')).not.toBe(soundOf('great'))
  })
})

describe('spokenKey', () => {
  it('reads a key however it is said or written down', () => {
    const k = (s: string) => spokenKey(s.split(' '))
    expect(k('key of e')).toEqual({ key: 'E', minor: false })
    expect(k('in b flat')).toEqual({ key: 'Bb', minor: false })
    expect(k('the key of eb')).toEqual({ key: 'Eb', minor: false })
    expect(k('f sharp minor')).toEqual({ key: 'F#', minor: true })
    expect(k('in bee')).toEqual({ key: 'B', minor: false })
    expect(k('key of see')).toEqual({ key: 'C', minor: false })
    expect(k('g major')).toEqual({ key: 'G', minor: false })
    expect(k('a minor')).toEqual({ key: 'A', minor: true })
    expect(k('g flat')).toEqual({ key: 'F#', minor: false })
    expect(k('c sharp')).toEqual({ key: 'Db', minor: false })
  })

  it('is nothing else', () => {
    const k = (s: string) => spokenKey(s.split(' '))
    expect(k('forever')).toBeNull()
    expect(k('key of')).toBeNull()
    expect(k('e and g')).toBeNull()
  })
})

describe('parseSongRequest', () => {
  it('finds a title with a key after it', () => {
    expect(ask('Firm Foundation key of E')).toEqual({ id: 1, key: 'E', minor: false })
    expect(ask('Firm Foundation, in the key of E.')).toEqual({ id: 1, key: 'E', minor: false })
    expect(ask('pull up Holy Forever in B♭')).toEqual({ id: 3, key: 'Bb', minor: false })
    expect(ask('Build my life in F# minor please')).toEqual({ id: 4, key: 'F#', minor: true })
  })

  it('or before it', () => {
    expect(ask('key of G build my life')).toEqual({ id: 4, key: 'G', minor: false })
  })

  it('or a title alone, which keeps the key as it was', () => {
    expect(ask('Firm Foundation')).toEqual({ id: 1, key: null, minor: false })
    expect(ask('open firm foundation he wont')).toEqual({ id: 1, key: null, minor: false })
    expect(ask('King of Kings')).toEqual({ id: 5, key: null, minor: false })
  })

  it('takes the longest title that fits', () => {
    expect(ask('holy forever')).toEqual({ id: 3, key: null, minor: false })
    expect(ask('holy')).toEqual({ id: 2, key: null, minor: false })
    expect(ask('holy in d')).toEqual({ id: 2, key: 'D', minor: false })
  })

  it('reads a key the way speech recognition runs it together', () => {
    const d = { id: 2, key: 'D', minor: false }
    expect(ask('Holy KFD')).toEqual(d)
    expect(ask('holy kod')).toEqual(d)
    expect(ask('holy keyofd')).toEqual(d)
    expect(ask('holy indie')).toEqual(d)
    expect(ask('Holy indeed')).toEqual(d)
    expect(ask('holy in the')).toEqual(d)
    expect(ask('holy key of the')).toEqual(d)
    expect(ask('holy key off')).toEqual({ id: 2, key: 'F', minor: false })
    expect(ask('Holy Kyiv D')).toEqual(d)
    expect(ask('holy kiev d')).toEqual(d)
    expect(ask('holy q of d')).toEqual(d)
    expect(ask('holy keyoff d')).toEqual(d)
    expect(ask('holy Kyiv the')).toEqual(d)
    expect(ask('holy Kyiv b flat')).toEqual({ id: 2, key: 'Bb', minor: false })
    expect(ask('holy Kyiv')).toBeNull()
    expect(ask('holy inf')).toEqual({ id: 2, key: 'F', minor: false })
    expect(ask('holy insee')).toEqual({ id: 2, key: 'C', minor: false })
    expect(ask('holy ingee')).toEqual({ id: 2, key: 'G', minor: false })
    expect(ask('holy any')).toEqual({ id: 2, key: 'E', minor: false })
    expect(ask('holy in eflat')).toEqual({ id: 2, key: 'Eb', minor: false })
    expect(ask('holy in the key of b flat minor')).toEqual({ id: 2, key: 'Bb', minor: true })
  })

  it('hears a title the way speech recognition spells it', () => {
    expect(ask('Agnes Day')).toEqual({ id: 6, key: null, minor: false })
    expect(ask('agnes day in a')).toEqual({ id: 6, key: 'A', minor: false })
    expect(ask('Firm Foundations key of E')).toEqual({ id: 1, key: 'E', minor: false })
  })

  it('finds a title by the other name in its brackets', () => {
    expect(ask('ten thousand reasons in G')).toEqual({ id: 7, key: 'G', minor: false })
    expect(ask('10,000 reasons')).toEqual({ id: 7, key: null, minor: false })
    expect(ask('10000 reasons')).toEqual({ id: 7, key: null, minor: false })
    expect(ask('arms of a father')).toEqual({ id: 8, key: null, minor: false })
    expect(ask('abba')).toEqual({ id: 8, key: null, minor: false })
  })

  it('prefers the title said exactly to one that only sounds like it', () => {
    expect(ask('holy')).toEqual({ id: 2, key: null, minor: false })
    expect(ask('holly')).toEqual({ id: 2, key: null, minor: false })
  })

  it('lets one word of a longer title be misheard', () => {
    expect(ask('Oh Hill King Jesus and C-sharp')).toEqual({ id: 9, key: 'Db', minor: false })
    expect(ask('all hail king jesus')).toEqual({ id: 9, key: null, minor: false })
    // Not in a title of two words, where one is half of it.
    expect(ask('holy whatever')).toBeNull()
  })

  it('is not a title sung inside a line', () => {
    expect(ask('holy holy holy is the lord god almighty')).toBeNull()
    expect(ask('christ is my firm foundation the rock on which i stand')).toBeNull()
    expect(ask('firm foundation key of e and g')).toBeNull()
    expect(ask('')).toBeNull()
  })
})

describe('closestTitles', () => {
  it('offers the titles most of whose words were heard', () => {
    expect(closestTitles(sheets, 'Oh Hill King Jesus and C-sharp').map((s) => s.id)).toEqual([9])
    expect(closestTitles(sheets, 'holy for ever').map((s) => s.id)[0]).toBe(3)
  })

  it('not ones that only share a small word', () => {
    expect(closestTitles(sheets, 'the son of the morning')).not.toContainEqual(
      expect.objectContaining({ id: 10 })
    )
    expect(closestTitles(sheets, 'of the')).toEqual([])
  })
})

describe('trailingKey', () => {
  it('finds a key said at the end', () => {
    expect(trailingKey('oh hill king jesus and c-sharp')).toEqual({ key: 'Db', minor: false })
    expect(trailingKey('something something in b flat minor')).toEqual({ key: 'Bb', minor: true })
    expect(trailingKey('something something')).toBeNull()
  })
})

describe('splitSpokenKey', () => {
  it('parts the name of the song from a key said after it', () => {
    expect(splitSpokenKey('Oh Hill King Jesus and C-sharp')).toEqual({
      name: 'oh hill king jesus',
      key: { key: 'Db', minor: false },
    })
    expect(splitSpokenKey('pull up agnes day please')).toEqual({ name: 'agnes day', key: null })
  })
})

describe('requestFromAliases', () => {
  const aliases = new Map([['oh hill king jesus', '9']])
  it('opens the song a phrase was corrected to, in any key said with it', () => {
    expect(requestFromAliases(aliases, sheets, 'Oh hill King Jesus in D')).toEqual({
      sheet: { id: 9, title: 'All Hail King Jesus' },
      key: 'D',
      minor: false,
    })
    expect(requestFromAliases(aliases, sheets, 'oh hill king jesus')?.key).toBeNull()
  })

  it('knows nothing it has not been taught', () => {
    expect(requestFromAliases(aliases, sheets, 'oh hill king')).toBeNull()
    expect(requestFromAliases(new Map([['x', 'gone']]), sheets, 'x')).toBeNull()
  })
})
