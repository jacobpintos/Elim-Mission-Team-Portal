import { describe, it, expect } from 'vitest'
import { nashvilleToChord, NNS_KEYS } from './nashvilleNumbers'
import { chordNotes, chromagram, parseWav, rankKeys, songProfile, suggestKey } from './keyDetect'

/**
 * Made-up music: a sheet's numbers played as chords in a chosen key — each
 * note with the overtones a real instrument has, a bass under it, a tune
 * over it from the key's scale, and noise — at the 16 kHz the phone keeps.
 */
const RATE = 16000
const freq = (pc: number, octave: number) => 440 * 2 ** ((pc + 12 * (octave + 1) - 69) / 12)

function play(
  tokens: string[],
  keyIdx: number,
  { seconds = 20, noise = 0, melody = false, isMinor = false } = {}
): Float32Array {
  const out = new Float32Array(seconds * RATE)
  const perChord = 1.5 * RATE
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const scale = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
  for (let i = 0; i < out.length; i++) {
    const chord = tokens[Math.floor(i / perChord) % tokens.length]
    const notes = chordNotes(nashvilleToChord(chord, keyIdx, isMinor))
    const t = i / RATE
    let s = 0
    const tone = (f: number, amp: number) => {
      for (let h = 1; h <= 4; h++) s += (amp / h) * Math.sin(2 * Math.PI * f * h * t)
    }
    tone(freq(notes[0], 2), 0.5) // bass
    notes.forEach((n) => tone(freq(n, 3), 0.3))
    if (melody) {
      const step = scale[Math.floor(t * 3) % scale.length]
      tone(freq((keyIdx + step) % 12, 4), 0.35)
    }
    out[i] = s * 0.1 + noise * rand()
  }
  return out
}

const guess = (tokens: string[], keyIdx: number, opts: Parameters<typeof play>[2] = {}) => {
  const heard = chromagram(play(tokens, keyIdx, opts), RATE)
  return suggestKey(heard, songProfile(tokens, opts.isMinor ?? false))
}

const POP = ['1', '5', '6m', '4']

describe('chordNotes', () => {
  it('reads chord names into their notes', () => {
    expect(chordNotes('F#m7')).toEqual([6, 9, 1, 4])
    expect(chordNotes('Bb/D')).toEqual([10, 2, 5, 2])
    expect(chordNotes('Gsus4')).toEqual([7, 0, 2])
    expect(chordNotes('Bdim')).toEqual([11, 2, 5])
    expect(chordNotes('Cmaj7')).toEqual([0, 4, 7, 11])
  })
})

describe('parseWav', () => {
  const samples = [0, 0.5, -0.5, 0.25]
  const wavFile = (dataLength?: number) => {
    const data = new Int16Array(samples.map((v) => Math.round(v * 32767)))
    const buf = new ArrayBuffer(44 + data.byteLength)
    const v = new DataView(buf)
    const w = (at: number, s: string) =>
      [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
    w(0, 'RIFF')
    v.setUint32(4, 36 + data.byteLength, true)
    w(8, 'WAVE')
    w(12, 'fmt ')
    v.setUint32(16, 16, true)
    v.setUint16(20, 1, true)
    v.setUint16(22, 1, true)
    v.setUint32(24, 16000, true)
    v.setUint32(28, 32000, true)
    v.setUint16(32, 2, true)
    v.setUint16(34, 16, true)
    w(36, 'data')
    v.setUint32(40, dataLength ?? data.byteLength, true)
    new Int16Array(buf, 44).set(data)
    return new Uint8Array(buf)
  }
  const rounded = (wav: { samples: Float32Array } | null) =>
    [...wav!.samples].map((x) => Math.round(x * 100) / 100)

  it('reads the 16-bit file the phone keeps', () => {
    const wav = parseWav(wavFile())!
    expect(wav.sampleRate).toBe(16000)
    expect(rounded(wav)).toEqual(samples)
  })

  it('reads to the end a file whose length was never written', () => {
    expect(rounded(parseWav(wavFile(0)))).toEqual(samples)
    expect(rounded(parseWav(wavFile(0xffffffff)))).toEqual(samples)
  })

  it('turns away anything that is not a WAV', () => {
    expect(parseWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull()
  })
})

describe('suggestKey', () => {
  it('finds the key a progression is played in, in all twelve', () => {
    for (let k = 0; k < 12; k++) {
      expect(guess(POP, k, { seconds: 8 })?.keyIdx, NNS_KEYS[k]).toBe(k)
    }
  }, 30_000)

  it('with a tune over it and a noisy room', () => {
    for (const k of [2, 9, 3, 10]) {
      expect(guess(POP, k, { melody: true, noise: 0.05 })?.keyIdx, NNS_KEYS[k]).toBe(k)
    }
  })

  it('tells a key from the keys a fifth either side, which share most of its notes', () => {
    const song = ['1', '4', '5', '1', '6m', '4', '2m', '5']
    const g = guess(song, 7, { melody: true })
    expect(g?.keyIdx).toBe(7) // G, not C or D
  })

  it('in a minor key, with the sheet read in minor', () => {
    const minor = ['1', '6', '3', '7']
    expect(guess(minor, 9, { isMinor: true })?.keyIdx).toBe(9) // A minor
  })

  it('suggests nothing from silence, or from a sheet with no chords', () => {
    expect(
      suggestKey(chromagram(new Float32Array(RATE * 5), RATE), songProfile(POP, false))
    ).toBeNull()
    expect(suggestKey(chromagram(play(POP, 2), RATE), songProfile([], false))).toBeNull()
  })

  it('suggests nothing when the sound is noise, not the song', () => {
    let seed = 3
    const noise = new Float32Array(RATE * 10).map(
      () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    )
    expect(suggestKey(chromagram(noise, RATE), songProfile(POP, false))).toBeNull()
  })

  it('suggests nothing when the band is buried in noise', () => {
    expect(guess(POP, 2, { melody: true, noise: 0.2, seconds: 10 })).toBeNull()
  })

  it('ranks every key, the right one first', () => {
    const ranked = rankKeys(chromagram(play(POP, 4), RATE), songProfile(POP, false))
    expect(ranked).toHaveLength(12)
    expect(ranked[0].keyIdx).toBe(4)
    expect(ranked[0].lead).toBeGreaterThan(0)
  })
})
