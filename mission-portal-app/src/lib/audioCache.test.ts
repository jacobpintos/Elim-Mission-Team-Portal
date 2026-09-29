import { describe, it, expect } from 'vitest'
import { stableAudioUrl, cacheKeyFor } from './audioCacheKey'

/** A download URL of the shape Firebase actually hands out. */
const withToken = (token: string) =>
  'https://firebasestorage.googleapis.com/v0/b/mission.appspot.com/o/' +
  `setListAudio%2Fs1%2F1700000000_Have_Your_Way.mp3?alt=media&token=${token}`

describe('stableAudioUrl', () => {
  it('drops the query, which is where the token lives', () => {
    // The whole point: Firebase reissues the token, and a cache keyed on it
    // would miss every time that happened.
    expect(stableAudioUrl(withToken('aaa'))).toBe(stableAudioUrl(withToken('bbb')))
  })

  it('leaves a url with no query alone', () => {
    expect(stableAudioUrl('https://example.com/a.mp3')).toBe('https://example.com/a.mp3')
  })

  it('drops a fragment too', () => {
    expect(stableAudioUrl('https://example.com/a.mp3#t=30')).toBe('https://example.com/a.mp3')
  })
})

describe('cacheKeyFor', () => {
  it('gives the same name for the same track whatever its token', () => {
    expect(cacheKeyFor(withToken('aaa'))).toBe(cacheKeyFor(withToken('bbb')))
  })

  it('gives different names to different tracks', () => {
    expect(cacheKeyFor('https://example.com/one.mp3')).not.toBe(
      cacheKeyFor('https://example.com/two.mp3')
    )
  })

  it('keeps the name readable, so a cache directory can be understood', () => {
    expect(cacheKeyFor(withToken('aaa'))).toContain('Have_Your_Way.mp3')
  })

  it('produces something a filesystem will accept', () => {
    // Percent-encoded slashes decode to real ones, which would otherwise read
    // as directories that do not exist.
    const key = cacheKeyFor(withToken('aaa'))
    expect(key).toMatch(/^[a-z0-9]+_[a-zA-Z0-9._-]+$/)
    expect(key).not.toContain('/')
  })

  it('still produces a name for a url with nothing useful on the end', () => {
    expect(cacheKeyFor('https://example.com/')).toMatch(/^[a-z0-9]+_track$/)
    expect(cacheKeyFor('')).toMatch(/_track$/)
  })

  it('keeps the name short enough to write', () => {
    const long = `https://example.com/${'a'.repeat(300)}.mp3`
    expect(cacheKeyFor(long).length).toBeLessThanOrEqual(60)
  })
})
