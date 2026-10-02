import { describe, expect, it } from 'vitest'
import { parseSongRequest, spokenKey } from './songRequest'

const sheets = [
  { id: 1, title: 'Firm Foundation (He Won’t)' },
  { id: 2, title: 'Holy' },
  { id: 3, title: 'Holy Forever' },
  { id: 4, title: 'Build My Life' },
  { id: 5, title: 'King of Kings' },
]
const ask = (text: string) => {
  const r = parseSongRequest(sheets, text)
  return r ? { id: r.sheet.id, key: r.key, minor: r.minor } : null
}

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

  it('is not a title sung inside a line', () => {
    expect(ask('holy holy holy is the lord god almighty')).toBeNull()
    expect(ask('christ is my firm foundation the rock on which i stand')).toBeNull()
    expect(ask('firm foundation key of e and g')).toBeNull()
    expect(ask('')).toBeNull()
  })
})
