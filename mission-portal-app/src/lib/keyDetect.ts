import { nashvilleToChord } from '@/lib/nashvilleNumbers'

/**
 * Which key a song is being played in, from what the microphone heard and
 * the chords on its sheet.
 *
 * Not key-finding from nothing, which goes wrong often enough to be no use:
 * the song is already known, so this only has to say which of twelve
 * transpositions of its own chords the sound fits best. The sound is turned
 * into how strong each of the twelve notes is (a chromagram), the sheet's
 * chords into how often each note of the scale is in them, and the two are
 * compared in every key.
 *
 * The answer is offered, not applied: keys a fifth apart share six of their
 * seven notes, and a phone in a noisy room can mistake one for the other.
 *
 * Pure — samples in, key out — so it can be tested with made-up music.
 */

/** Pitch classes, C = 0 … B = 11, as NNS_KEYS counts them. */
export type Chroma = number[]

/** A WAV file's samples, mixed to mono, as -1…1. Null if it is not one this reads. */
export function parseWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let format = 0
  let channels = 1
  let sampleRate = 0
  let bits = 0
  let at = 12
  while (at + 8 <= bytes.length) {
    const id = tag(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
      // WAVE_FORMAT_EXTENSIBLE: the real format is in the sub-format.
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true)
    } else if (id === 'data') {
      const bytesPer = bits / 8
      // A recorder stopped before writing the length leaves it 0 (or all ones).
      const end =
        size === 0 || size === 0xffffffff ? bytes.length : Math.min(bytes.length, body + size)
      const frames = Math.floor((end - body) / (bytesPer * channels))
      const samples = new Float32Array(frames)
      for (let f = 0; f < frames; f++) {
        let sum = 0
        for (let c = 0; c < channels; c++) {
          const p = body + (f * channels + c) * bytesPer
          if (format === 3 && bits === 32) sum += view.getFloat32(p, true)
          else if (format === 3 && bits === 64) sum += view.getFloat64(p, true)
          else if (format === 1 && bits === 16) sum += view.getInt16(p, true) / 32768
          else if (format === 1 && bits === 32) sum += view.getInt32(p, true) / 2147483648
          else return null
        }
        samples[f] = sum / channels
      }
      return sampleRate > 0 ? { samples, sampleRate } : null
    }
    at = body + size + (size % 2)
  }
  return null
}

/** In-place radix-2 FFT; re and im the same power-of-two length. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/**
 * How strong each of the twelve notes is across the sound, from bass to
 * the top of a voice (65 Hz – 2 kHz). Each stretch of sound counts the same
 * however loud, so a loud chorus does not drown out a quiet verse; near
 * silence counts for nothing. The last `maxSeconds` only: the song as it is
 * being played now.
 */
export function chromagram(samples: Float32Array, sampleRate: number, maxSeconds = 30): Chroma {
  // Fine enough to tell neighbouring bass notes apart: about 2 Hz a bin.
  let size = 1
  while (sampleRate / size > 2.5) size <<= 1
  const start = Math.max(0, samples.length - Math.floor(maxSeconds * sampleRate))
  const window = new Float64Array(size).map(
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  )
  // Which note each bin is, if it is close enough to one to say.
  const binNote = new Int8Array(size / 2).fill(-1)
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sampleRate) / size
    if (f < 65 || f > 2000) continue
    const midi = 69 + 12 * Math.log2(f / 440)
    const nearest = Math.round(midi)
    if (Math.abs(midi - nearest) < 0.4) binNote[k] = ((nearest % 12) + 12) % 12
  }
  const frames: { chroma: number[]; energy: number }[] = []
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let at = start; at + size <= samples.length; at += size / 2) {
    let energy = 0
    for (let i = 0; i < size; i++) {
      const s = samples[at + i]
      energy += s * s
      re[i] = s * window[i]
      im[i] = 0
    }
    fft(re, im)
    const chroma = new Array(12).fill(0)
    for (let k = 1; k < size / 2; k++) {
      const note = binNote[k]
      if (note >= 0) chroma[note] += Math.sqrt(Math.hypot(re[k], im[k]))
    }
    frames.push({ chroma, energy })
  }
  const loudest = Math.max(0, ...frames.map((f) => f.energy))
  const total = new Array(12).fill(0)
  for (const { chroma, energy } of frames) {
    if (energy < loudest * 0.02) continue
    const peak = Math.max(...chroma)
    if (peak > 0) chroma.forEach((v, i) => (total[i] += v / peak))
  }
  return total
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** The notes of a chord name ("F#m7", "Bb/D", "Gsus4"), as pitch classes. */
export function chordNotes(name: string): number[] {
  const [main, bassName] = name.split('/')
  const m = main.match(/^([A-G])([#b]?)(.*)$/)
  if (!m) return []
  const root = (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12
  const q = m[3]
  const minor = /^(m(?!aj)|min|-)/.test(q)
  let tones = [0, minor ? 3 : 4, 7]
  if (/dim|°/.test(q)) tones = [0, 3, 6]
  if (/aug|\+/.test(q)) tones = [0, 4, 8]
  if (/sus2/.test(q)) tones = [0, 2, 7]
  else if (/sus/.test(q)) tones = [0, 5, 7]
  if (/maj7|M7|Δ/.test(q)) tones.push(11)
  else if (/7/.test(q)) tones.push(/dim7|°7/.test(q) ? 9 : 10)
  if (/(^|[^1])6/.test(q)) tones.push(9)
  const notes = tones.map((t) => (root + t) % 12)
  const b = bassName?.match(/^([A-G])([#b]?)/)
  if (b) notes.push((LETTER[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0) + 12) % 12)
  return notes
}

/**
 * How much each note of a key is heard in music in it, generally — the
 * Krumhansl–Kessler profiles, from listeners rating how well each note fits
 * a key. Counted from the key's root.
 */
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const scaled = (v: number[]) => {
  const top = Math.max(...v)
  return top > 0 ? v.map((x) => x / top) : v
}

/**
 * The song's own notes, from the numbers on its sheet: how much each note of
 * the scale, counted from the key's root, is in its chords — roots most —
 * with the notes music in a key generally has added in equal measure. The
 * chords alone leave out the tune, which is what most often tells a key from
 * the one a fifth away (the fourth of one is a sharp in the other): added,
 * the closest calls on made-up music went from leads of 0.03 to 0.09. No
 * chords, no profile: there is nothing of this song's to go on.
 */
export function songProfile(tokens: string[], isMinor: boolean): Chroma {
  const chords = new Array(12).fill(0)
  for (const token of tokens) {
    for (const part of token.replace(/\.$/, '').split(/[\s>]+/)) {
      if (!part || part === '||' || part === '_') continue
      const notes = chordNotes(nashvilleToChord(part, 0, isMinor))
      notes.forEach((n, i) => (chords[n] += i === 0 ? 1.5 : 1))
    }
  }
  if (chords.every((v) => v === 0)) return chords
  const general = scaled(isMinor ? KK_MINOR : KK_MAJOR)
  return scaled(chords).map((v, i) => v + general[i])
}

/**
 * Correlation, not plain similarity: each note measured against the average
 * of the twelve. Keys a fifth apart share six notes, so a plain comparison
 * scores them nearly alike; it is the note one has and the other lacks that
 * tells them apart, and correlation is what weighs that.
 */
function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / 12
  const mb = b.reduce((x, y) => x + y, 0) / 12
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < 12; i++) {
    dot += (a[i] - ma) * (b[i] - mb)
    na += (a[i] - ma) ** 2
    nb += (b[i] - mb) ** 2
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface KeyGuess {
  /** The key, as NNS_KEYS counts them: C = 0 … B = 11. */
  keyIdx: number
  /** How well the sound fits it: correlation, -1 to 1. */
  fit: number
  /** How far ahead of the next-best key. */
  lead: number
}

/** The song's chords in every key against the sound; best first. */
export function rankKeys(heard: Chroma, profile: Chroma): KeyGuess[] {
  const fits = Array.from({ length: 12 }, (_, k) => {
    const moved = Array.from({ length: 12 }, (_, n) => profile[(n - k + 12) % 12])
    return { keyIdx: k, fit: correlation(heard, moved) }
  }).sort((a, b) => b.fit - a.fit)
  return fits.map((g, i) => ({ ...g, lead: i === 0 ? g.fit - (fits[1]?.fit ?? 0) : 0 }))
}

/**
 * Sure enough to suggest: fitting well, and clearly better than the next
 * key — which, when it is close, is nearly always the key a fifth away.
 * Measured on made-up music: the right key fits 0.74–0.96 and leads by
 * 0.09–0.37; plain noise fits no key better than 0.25; a band buried in loud
 * noise fits about 0.4 — too unsure, and left unsuggested.
 */
export const MIN_FIT = 0.6
export const MIN_LEAD = 0.06

export function suggestKey(heard: Chroma, profile: Chroma): KeyGuess | null {
  if (heard.every((v) => v === 0) || profile.every((v) => v === 0)) return null
  const [best] = rankKeys(heard, profile)
  return best && best.fit >= MIN_FIT && best.lead >= MIN_LEAD ? best : null
}
