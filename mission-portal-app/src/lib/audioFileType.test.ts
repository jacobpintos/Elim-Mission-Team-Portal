import { describe, it, expect } from 'vitest'
import { looksLikeAudio, audioContentType } from './audioFileType'

describe('looksLikeAudio', () => {
  it('accepts a file the browser knows is audio', () => {
    expect(looksLikeAudio('track.mp3', 'audio/mpeg')).toBe(true)
    expect(looksLikeAudio('anything', 'audio/mp4')).toBe(true)
  })

  it('accepts an mp3 the browser refused to identify', () => {
    // The case that started this: a track that reached the phone through
    // another app arrives as plain data, or as nothing at all.
    expect(looksLikeAudio('Have Your Way.mp3', 'application/octet-stream')).toBe(true)
    expect(looksLikeAudio('Have Your Way.mp3', '')).toBe(true)
    expect(looksLikeAudio('Have Your Way.mp3', undefined)).toBe(true)
    expect(looksLikeAudio('Have Your Way.mp3', null)).toBe(true)
  })

  it('accepts the other formats a phone hands out', () => {
    for (const name of ['a.m4a', 'a.aac', 'a.wav', 'a.flac', 'a.ogg', 'a.caf', 'a.aiff']) {
      expect(looksLikeAudio(name, '')).toBe(true)
    }
  })

  it('is not case sensitive about the extension', () => {
    expect(looksLikeAudio('TRACK.MP3', '')).toBe(true)
  })

  it('turns down something that is plainly not a track', () => {
    expect(looksLikeAudio('chords.pdf', 'application/pdf')).toBe(false)
    expect(looksLikeAudio('photo.jpg', 'image/jpeg')).toBe(false)
    expect(looksLikeAudio('noextension', '')).toBe(false)
    expect(looksLikeAudio('', '')).toBe(false)
  })
})

describe('audioContentType', () => {
  it('keeps a real audio type the browser reported', () => {
    expect(audioContentType('track.mp3', 'audio/mpeg')).toBe('audio/mpeg')
    expect(audioContentType('track.m4a', 'audio/x-m4a')).toBe('audio/x-m4a')
  })

  it('ignores a type that is not audio and reads the name instead', () => {
    // Storage requires audio/* on this path, so storing an mp3 as
    // application/octet-stream is an upload the rules reject.
    expect(audioContentType('track.mp3', 'application/octet-stream')).toBe('audio/mpeg')
    expect(audioContentType('track.wav', 'application/octet-stream')).toBe('audio/wav')
  })

  it('reads the name when nothing was reported', () => {
    expect(audioContentType('track.m4a', undefined)).toBe('audio/mp4')
    expect(audioContentType('track.flac', '')).toBe('audio/flac')
  })

  it('always returns an audio type, so the upload is never refused', () => {
    // looksLikeAudio has already had its say by the time this runs; whatever
    // reaches here must still be stored as something the rule allows.
    expect(audioContentType('mystery', '')).toMatch(/^audio\//)
    expect(audioContentType('mystery', 'application/octet-stream')).toMatch(/^audio\//)
  })
})
