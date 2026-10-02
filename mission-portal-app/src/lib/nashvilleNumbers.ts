export const NNS_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export type NNSKey = (typeof NNS_KEYS)[number]

/**
 * The keys on the black notes go by two names, and charts are written under
 * either — a band that knows a song in Gb looks for Gb, not F#. Each is still
 * one key (one button, spelled as NNS_KEYS spells it); it is only labelled
 * with both names, so it is found under either.
 */
const BOTH_NAMES: Record<string, string> = {
  Db: 'Db / C#',
  Eb: 'Eb / D#',
  'F#': 'Gb / F#',
  Ab: 'Ab / G#',
  Bb: 'Bb / A#',
}

/** A key as it is shown: "Gb / F#", "G". Minor adds "m" to each name. */
export function keyLabel(key: string, minor = false): string {
  const label = BOTH_NAMES[key] ?? key
  return minor ? label.replace(/([A-G][b#]?)/g, '$1m') : label
}

// Semitones from root for each scale degree (1–7)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] // natural minor

const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Roots that prefer flat note names (Db Eb F Ab Bb and their minor equivalents)
const FLAT_ROOT_INDICES = new Set([1, 3, 5, 8, 10])

/**
 * Convert a Nashville Number System token to a chord name.
 *
 * Token format:  [b|#]<degree>[quality]
 *   degree  : 1–7
 *   quality : m, maj7, m7, 7, sus4, dim, aug, add9, M, etc.
 *   examples: "1", "b7", "#4", "5m", "4maj7"
 *
 * In a major key, a bare 2, 3, or 6 (no quality at all) is diatonically
 * minor — matching standard NNS convention — so it renders with an "m"
 * automatically (e.g. "6" → "Am" in the key of C). Write "M" as the quality
 * to force major instead (e.g. "6M" → "A"). This only applies to bare
 * degrees: any other quality ("7", "m7", "sus4", …) is left exactly as
 * written, so "67" is still the dominant 7 (A7), not "Am7".
 *
 * @param token    NNS token string
 * @param keyIdx   Index into NNS_KEYS (0 = C, 1 = Db, …)
 * @param isMinor  Use natural-minor scale intervals (default: false = major)
 */
/**
 * The note a scale degree lands on, with no chord quality attached.
 *
 * Shared by the chord root and the bass note after a slash, which need the
 * same arithmetic and emphatically not the same naming: a bass note is a note.
 */
function degreeToNoteName(
  accidental: string,
  degree: number,
  keyIdx: number,
  isMinor: boolean
): string {
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS
  let semitones = intervals[degree - 1]

  if (accidental === 'b') semitones -= 1
  if (accidental === '#') semitones += 1
  semitones = ((semitones % 12) + 12) % 12

  const rootName = NNS_KEYS[keyIdx]
  const rootIdx =
    CHROMATIC_SHARPS.indexOf(rootName) !== -1
      ? CHROMATIC_SHARPS.indexOf(rootName)
      : CHROMATIC_FLATS.indexOf(rootName)

  const noteIdx = (((rootIdx + semitones) % 12) + 12) % 12
  return FLAT_ROOT_INDICES.has(keyIdx) ? CHROMATIC_FLATS[noteIdx] : CHROMATIC_SHARPS[noteIdx]
}

/** The bass half of a slash chord: "[b|#]<degree>", or nothing it understands. */
const BASS_DEGREE = /^([b#]?)([1-7])$/

export function nashvilleToChord(token: string, keyIdx: number, isMinor = false): string {
  // A slash chord is a chord over a bass note — "1/7" is C/B in the key of C.
  // It is split here rather than by each caller, which is how the bass came to
  // be transposed in some places and printed as a bare number in others: the
  // viewer split the token itself, so "1/7" worked but "1>1/7" did not, and
  // the callers that split also handed each half to this function as a chord,
  // so "1/6" came out "C/Am" — a bass note wearing a chord's quality.
  const slashAt = token.indexOf('/')
  if (slashAt > 0) {
    const root = nashvilleToChord(token.slice(0, slashAt), keyIdx, isMinor)
    const bass = token.slice(slashAt + 1)
    const bassMatch = bass.match(BASS_DEGREE)
    // A bass this does not recognise is left as written rather than guessed at.
    if (!bassMatch) return `${root}/${bass}`
    return `${root}/${degreeToNoteName(bassMatch[1], parseInt(bassMatch[2], 10), keyIdx, isMinor)}`
  }

  const match = token.match(/^([b#]?)([1-7])(.*)$/)
  if (!match) return token

  const [, accidental, degreeStr, quality] = match
  const degree = parseInt(degreeStr, 10)
  const noteName = degreeToNoteName(accidental, degree, keyIdx, isMinor)

  // "M" on its own is an explicit-major marker — it overrides the diatonic
  // minor default below and never appears in the rendered name.
  const explicitMajor = quality === 'M'
  const effectiveQuality = explicitMajor ? '' : quality

  const diatonicMinor =
    !isMinor &&
    !explicitMajor &&
    !effectiveQuality &&
    (degree === 2 || degree === 3 || degree === 6)
  if (diatonicMinor) return `${noteName}m`

  if (!effectiveQuality) return noteName
  // Wrap multi-word qualifiers in parens for readability: Ab(sus4), Ab(maj7), Ab(add9), Ab(dim), Ab(aug)
  if (/^(sus|maj|add|dim|aug)/.test(effectiveQuality)) return `${noteName}(${effectiveQuality})`
  return `${noteName}${effectiveQuality}`
}

/**
 * Replace each non-space token in a chord-line string with the chord name,
 * preserving whitespace so alignment over lyrics is maintained.
 *
 * If keyIdx < 0 the line is returned unchanged (Nashville # display mode).
 */
export function convertChordLine(line: string, keyIdx: number, isMinor = false): string {
  if (keyIdx < 0) return line
  return line.replace(/[^\s]+/g, (token) => nashvilleToChord(token, keyIdx, isMinor))
}

export interface WordSlot {
  text: string
  trailing: '-' | ' ' | ''
}

/**
 * Split a lyrics line into word slots for per-word chord alignment.
 * Spaces between words and hyphens within words both create slot boundaries.
 * Each slot carries a `trailing` character ('-', ' ', or '') indicating
 * the separator that follows it in the original text.
 */
export function getWordSlots(line: string): WordSlot[] {
  const slots: WordSlot[] = []
  const spaceSegs = line.split(' ')
  spaceSegs.forEach((seg, si) => {
    if (!seg) return
    const parts = seg.split('-').filter((p) => p.length > 0)
    if (!parts.length) return
    parts.forEach((part, pi) => {
      slots.push({
        text: part,
        trailing: pi < parts.length - 1 ? '-' : si < spaceSegs.length - 1 ? ' ' : '',
      })
    })
  })
  return slots
}
