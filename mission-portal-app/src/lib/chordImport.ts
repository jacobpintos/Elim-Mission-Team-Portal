import type { ChordSheetSection, SectionType } from '@/types/chordSheet'
import { getWordSlots } from '@/lib/nashvilleNumbers'
import { PROGRESSION_END } from '@/features/worship/chordSheetFormat'

/**
 * Bring a chart in from somewhere else — a ChordPro file, or chords written
 * over lyrics as SongSelect, Worship Together and most sites show them — and
 * turn it into a chord sheet the builder can open.
 *
 * Three things have to happen, and they are kept apart so each can be tested:
 *
 *  1. Read the chart into sections of lines, each line its lyric and the
 *     chords above it at the column they sit over (parseChart).
 *  2. Work out the key it is written in (keyFromName, guessKey), because a
 *     sheet stores Nashville numbers and "G" means nothing without one.
 *  3. Place each chord on the word or syllable under it, as a number, the way
 *     the builder stores it (toSheetSections).
 *
 * Pure: no React, no platform, nothing read or written.
 */

// ─── Reading a chart ────────────────────────────────────────────────────────

export interface ImportedChord {
  /** The column the chord sits over in the line's lyric. */
  at: number
  chord: string
}

export interface ImportedLine {
  /** The words; '' for a line of chords alone. */
  lyrics: string
  chords: ImportedChord[]
}

export interface ImportedSection {
  type: SectionType
  /** The heading as the chart wrote it — "Verse 1", "Chorus" — for the preview. */
  label: string
  lines: ImportedLine[]
}

export interface ImportedSong {
  format: 'chordpro' | 'text'
  title?: string
  artist?: string
  bpm?: number
  /** The key as the chart gives it, if it does — "G", "F#m". */
  key?: string
  sections: ImportedSection[]
  /** Bracketed things in a ChordPro file that were not chords — [N.C.], [x2]. */
  skipped: string[]
}

/** ChordPro, or chords written over lyrics. */
export function detectFormat(text: string): 'chordpro' | 'text' {
  if (/^\s*\{\s*[a-z_]+\s*(:[^}]*)?\}\s*$/im.test(text)) return 'chordpro'
  if (/\[[A-G][#b♯♭]?[^\]\s]{0,10}\]\S/.test(text)) return 'chordpro'
  return 'text'
}

export function parseChart(text: string): ImportedSong {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ')
  return detectFormat(clean) === 'chordpro' ? parseChordPro(clean) : parseChordText(clean)
}

/** The heading words a chart uses, and what the builder calls each. */
const HEADINGS: [RegExp, SectionType][] = [
  [/^pre[\s-]?chorus$/i, 'pre-chorus'],
  [/^(chorus|refrain|hook)$/i, 'chorus'],
  [/^(verse)$/i, 'verse'],
  [/^(bridge|breakdown)$/i, 'bridge'],
  [/^(intro)$/i, 'intro'],
  [/^(interlude|instrumental|turnaround|turn)$/i, 'interlude'],
  [/^(tag|vamp)$/i, 'tag'],
  [/^(outro|ending|end|coda)$/i, 'outro'],
]

/**
 * A section heading, if this line is one — "Verse 1", "[Chorus]", "Bridge:",
 * "Chorus 2 (x2)", "PRE-CHORUS".
 *
 * Strict about what may follow the word: a number, a repeat mark, a colon.
 * "Bridge over troubled water" is a lyric, not a bridge.
 */
export function sectionHeading(line: string): { type: SectionType; label: string } | null {
  const m = line
    .trim()
    .match(
      /^[[(]?\s*([a-z]+(?:[\s-]?chorus)?)\s*(\d+[a-z]?)?\s*(?:\(?\s*x\s?\d+\s*\)?)?\s*:?\s*[\])]?\s*:?$/i
    )
  if (!m) return null
  const word = m[1]
  for (const [re, type] of HEADINGS) {
    if (re.test(word))
      return {
        type,
        label: line
          .trim()
          .replace(/^[[(]|[\])]:?$|:$/g, '')
          .trim(),
      }
  }
  return null
}

const ACCIDENTAL = '[#b♯♭]'
const QUALITY_PART = '(?:maj|min|mi|dim|aug|sus|add|no|m|M|Δ|°|ø|\\+|-|[0-9]|\\(|\\)|#|b|♯|♭)'
const LETTER_CHORD = new RegExp(
  `^([A-G])(${ACCIDENTAL}?)(${QUALITY_PART}*)(?:\\/([A-G])(${ACCIDENTAL}?))?$`
)

/** Marks that turn up on a chord line and are not chords: bars, repeats, slashes. */
const CHORD_LINE_MARK = /^(\|+|\|:|:\||\/+|%|-+|\.+|:|x\d+|\(x\d+\)|\d+x|n\.?c\.?|\(|\))$/i

/** Whether this reads as a chord: G, F#m7, Bb/D, Csus4, (G). */
export function isChord(token: string): boolean {
  return LETTER_CHORD.test(stripParens(token))
}

function stripParens(token: string): string {
  return token.replace(/^\((.+)\)$/, '$1')
}

/** The chords on a line made of chords alone, with their columns; null if it is not one. */
export function chordLine(line: string): ImportedChord[] | null {
  const chords: ImportedChord[] = []
  for (const m of line.matchAll(/\S+/g)) {
    const token = m[0]
    if (isChord(token)) chords.push({ at: m.index ?? 0, chord: stripParens(token) })
    else if (!CHORD_LINE_MARK.test(token)) return null
  }
  return chords.length > 0 ? chords : null
}

/**
 * Lines a chart carries that are not the song: SongSelect's copyright and
 * licence footer, and the like. Dropped rather than imported as a verse.
 */
const FOOTER = /(CCLI|©|\(c\)\s*\d{4}|copyright|songselect|terms of use|all rights reserved|www\.)/i

/** "Key - G", "Key: F#m", "Tempo - 72", "Key: G | Tempo: 72 | Time: 4/4". */
function metadata(line: string): { key?: string; bpm?: number } | null {
  const parts = line.split(/[|,;]/).map((p) => p.trim())
  let key: string | undefined
  let bpm: number | undefined
  let matched = false
  for (const p of parts) {
    const k = p.match(/^key\s*[-:=]\s*([A-G][#b♯♭]?\s*(?:m|min|minor|maj|major)?)$/i)
    const t = p.match(/^(?:tempo|bpm)\s*[-:=]\s*(\d{2,3})(?:\s*bpm)?$/i)
    const s = p.match(/^(?:time|time signature)\s*[-:=]\s*\d+\/\d+$/i)
    if (k) key = k[1].replace(/\s+/g, '')
    if (t) bpm = parseInt(t[1], 10)
    if (k || t || s) matched = true
    else if (p) return null
  }
  return matched ? { key, bpm } : null
}

/** Chords written over lyrics. */
export function parseChordText(text: string): ImportedSong {
  const song: ImportedSong = { format: 'text', sections: [], skipped: [] }
  const lines = text.split('\n')
  // Lines before anything recognisably musical: the title and the artist, if
  // a heading or chords follow them; the start of the lyrics if not.
  const preamble: string[] = []
  let started = false
  let current: ImportedSection | null = null

  const section = (): ImportedSection => {
    if (!current) {
      current = { type: 'verse', label: '', lines: [] }
      song.sections.push(current)
    }
    return current
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')
    if (!line.trim()) continue
    if (FOOTER.test(line)) continue
    const meta = metadata(line.trim())
    if (meta) {
      if (meta.key) song.key = meta.key
      if (meta.bpm) song.bpm = meta.bpm
      continue
    }

    const heading = sectionHeading(line)
    const chords = heading ? null : chordLine(line)

    if (!started) {
      if (!heading && !chords) {
        preamble.push(line.trim())
        continue
      }
      started = true
      if (preamble.length > 0 && preamble.length <= 3) {
        song.title = preamble[0]
        if (preamble[1]) song.artist = preamble[1]
      } else {
        for (const p of preamble) section().lines.push({ lyrics: p, chords: [] })
      }
    }

    if (heading) {
      current = { type: heading.type, label: heading.label, lines: [] }
      song.sections.push(current)
      continue
    }

    if (chords) {
      // Chords over the next line, if the next line is words; a line of
      // chords on its own — an intro, a turnaround — if not.
      const next = lines[i + 1]?.replace(/\s+$/, '') ?? ''
      const nextIsLyric =
        next.trim() !== '' && !sectionHeading(next) && !chordLine(next) && !FOOTER.test(next)
      if (nextIsLyric) {
        section().lines.push({ lyrics: next, chords })
        i++
      } else {
        section().lines.push({ lyrics: '', chords })
      }
      continue
    }

    section().lines.push({ lyrics: line, chords: [] })
  }

  // Nothing musical at all — a lyric sheet. What looked like a title was the
  // first lines of the song.
  if (!started) for (const p of preamble) section().lines.push({ lyrics: p, chords: [] })

  song.sections = song.sections.filter((s) => s.lines.length > 0)
  return song
}

/** ChordPro: [G] inline, {title: …}, {soc} … {eoc}, {comment: Verse 1}. */
export function parseChordPro(text: string): ImportedSong {
  const song: ImportedSong = { format: 'chordpro', sections: [], skipped: [] }
  let current: ImportedSection | null = null
  let skipping = false // inside a {start_of_tab} block

  const start = (type: SectionType, label: string) => {
    current = { type, label, lines: [] }
    song.sections.push(current)
  }
  const section = (): ImportedSection => {
    if (!current) start('verse', '')
    return current as unknown as ImportedSection
  }

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue

    const directive = line.match(/^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i)
    if (directive) {
      const name = directive[1].toLowerCase()
      const value = (directive[2] ?? '').trim()
      if (name === 'start_of_tab' || name === 'sot') skipping = true
      else if (name === 'end_of_tab' || name === 'eot') skipping = false
      else if (name === 'title' || name === 't') song.title = value
      else if (name === 'artist' || name === 'subtitle' || name === 'st') song.artist ??= value
      else if (name === 'key') song.key = value.replace(/\s+/g, '')
      else if (name === 'tempo' || name === 'bpm') {
        const n = parseInt(value, 10)
        if (n > 0) song.bpm = n
      } else if (/^(start_of_chorus|soc)$/.test(name)) start('chorus', value || 'Chorus')
      else if (/^(start_of_verse|sov)$/.test(name)) start('verse', value || 'Verse')
      else if (/^(start_of_bridge|sob)$/.test(name)) start('bridge', value || 'Bridge')
      else if (/^(start_of_grid|sog)$/.test(name)) start('interlude', value || 'Instrumental')
      else if (/^(start_of_|so)/.test(name) && value) {
        const h = sectionHeading(value)
        if (h) start(h.type, h.label)
      } else if (/^(end_of_|eo)/.test(name)) current = null
      else if (/^(comment|c|ci|cb|comment_italic|comment_box|highlight)$/.test(name)) {
        const h = sectionHeading(value)
        if (h) start(h.type, h.label)
      }
      continue
    }
    if (skipping) continue
    if (FOOTER.test(line) && !line.includes('[')) continue

    const plainHeading = !line.includes('[') ? sectionHeading(line) : null
    if (plainHeading) {
      start(plainHeading.type, plainHeading.label)
      continue
    }

    // Lift the bracketed chords out, noting the column each sat at.
    let lyrics = ''
    const chords: ImportedChord[] = []
    let last = 0
    for (const m of line.matchAll(/\[([^\]]*)\]/g)) {
      lyrics += line.slice(last, m.index)
      last = (m.index ?? 0) + m[0].length
      const inside = m[1].trim()
      if (isChord(inside)) chords.push({ at: lyrics.length, chord: stripParens(inside) })
      else if (inside) song.skipped.push(inside)
    }
    lyrics += line.slice(last)

    // A grid or chord-only line: bars and slashes, no words.
    const words = lyrics.replace(/[|/.\-:%]/g, ' ').trim()
    if (!words) {
      if (chords.length > 0) section().lines.push({ lyrics: '', chords })
      continue
    }
    section().lines.push({ lyrics, chords })
  }

  song.sections = song.sections.filter((s) => s.lines.length > 0)
  return song
}

// ─── The key ───────────────────────────────────────────────────────────────

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function semitone(letter: string, accidental: string): number {
  const acc = accidental === '#' || accidental === '♯' ? 1 : accidental ? -1 : 0
  return ((((NOTE[letter] ?? 0) + acc) % 12) + 12) % 12
}

/**
 * A key as a chart names it, as an index into NNS_KEYS — which runs in
 * semitones from C, so the index is the key's root.
 *
 * A minor key is numbered from its relative major, so "Em" is G: the viewer's
 * keys are major ones, and 6m is how a sheet in G writes E minor anyway.
 */
export function keyFromName(name: string): { keyIdx: number; minor: boolean } | null {
  const m = name.trim().match(/^([A-G])([#b♯♭]?)\s*(m|min|minor|maj|major)?$/i)
  if (!m) return null
  const root = semitone(m[1].toUpperCase(), m[2])
  const minor = !!m[3] && /^m(in(or)?)?$/i.test(m[3]) && m[3] !== 'M'
  return { keyIdx: minor ? (root + 3) % 12 : root, minor }
}

function chordRoot(chord: string): { root: number; minor: boolean } | null {
  const m = chord.match(LETTER_CHORD)
  if (!m) return null
  const quality = normaliseQuality(m[3])
  return {
    root: semitone(m[1], m[2]),
    minor: /^m(?!aj)/.test(quality) || quality.startsWith('dim'),
  }
}

/**
 * The most likely key for a chart that does not say.
 *
 * Each major key is scored on how many of the chords belong to it with the
 * right quality — I, IV, V major; ii, iii, vi minor — with weight on the
 * first and last chord, since songs usually start and end at home.
 */
export function guessKey(chords: string[]): number {
  const roots = chords.map(chordRoot).filter((r): r is { root: number; minor: boolean } => !!r)
  if (roots.length === 0) return 0
  const MAJOR = new Set([0, 5, 7])
  const MINOR = new Set([2, 4, 9])
  let best = roots[0].minor ? (roots[0].root + 3) % 12 : roots[0].root
  let bestScore = -1
  for (let k = 0; k < 12; k++) {
    let score = 0
    for (const r of roots) {
      const off = (r.root - k + 12) % 12
      if ((r.minor ? MINOR : MAJOR).has(off)) score += 1
      else if (MAJOR.has(off) || MINOR.has(off)) score += 0.4
    }
    if ((roots[0].root - k + 12) % 12 === 0 && !roots[0].minor) score += 2
    const last = roots[roots.length - 1]
    if ((last.root - k + 12) % 12 === 0 && !last.minor) score += 1.5
    if (score > bestScore) {
      bestScore = score
      best = k
    }
  }
  return best
}

// ─── Chords to numbers ─────────────────────────────────────────────────────

const DEGREE = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']

/** Chart spellings of a chord's quality in the form the sheet writes them. */
function normaliseQuality(q: string): string {
  let s = q.replace(/♯/g, '#').replace(/♭/g, 'b')
  if (s === 'M') return ''
  s = s.replace(/^min/, 'm').replace(/^mi(?!n)/, 'm')
  s = s.replace(/^M(?=[0-9])/, 'maj')
  s = s.replace(/^Δ7?/, 'maj7')
  s = s.replace(/^°7/, 'dim7').replace(/^°/, 'dim')
  s = s.replace(/^ø7?/, 'm7b5')
  s = s.replace(/^\+/, 'aug')
  s = s.replace(/^-(?=[0-9]|$)/, 'm')
  return s
}

/**
 * A chord name as a Nashville number in a major key: G in G is "1", Em is
 * "6m", G/B is "1/3", D7 in G is "57", Bb in C is "b7".
 *
 * A plain major 2, 3 or 6 is written "2M", "3M", "6M": the sheet reads a bare
 * 2, 3 or 6 as minor, the usual reading in a major key, and E in the key of C
 * is E, not Em. Null if it is not a chord.
 */
export function chordToNashville(chord: string, keyIdx: number): string | null {
  const m = stripParens(chord).match(LETTER_CHORD)
  if (!m) return null
  const [, letter, acc, rawQuality, bassLetter, bassAcc] = m
  const degree = DEGREE[(semitone(letter, acc) - keyIdx + 12) % 12]
  let quality = normaliseQuality(rawQuality)
  if (quality === '' && /[236]$/.test(degree)) quality = 'M'
  const bass = bassLetter ? `/${DEGREE[(semitone(bassLetter, bassAcc) - keyIdx + 12) % 12]}` : ''
  return `${degree}${quality}${bass}`
}

// ─── Placing chords on words ───────────────────────────────────────────────

interface Slot {
  start: number
  end: number
}

/** Where each word slot starts and ends — the same slots getWordSlots makes. */
function slotSpans(line: string): Slot[] {
  const spans: Slot[] = []
  for (const word of line.matchAll(/\S+/g)) {
    const at = word.index ?? 0
    let offset = 0
    for (const part of word[0].split('-')) {
      if (part.length > 0) spans.push({ start: at + offset, end: at + offset + part.length })
      offset += part.length + 1
    }
  }
  return spans
}

/**
 * One lyric line and the chords over it, as the sheet stores them: the words
 * (possibly with a syllable split or a "_" added) and a chord per word slot.
 *
 * - A chord over the start of a word goes on that word.
 * - A chord in the middle of a word splits it there with a hyphen — "gov-erned"
 *   — which is how sheets here already mark a chord on a later syllable, so it
 *   lands on the syllable it was written over. Only with at least two letters
 *   before it and three after: a chord one letter off the start of a word is a
 *   chart spaced a little unevenly, not a syllable, and a second chord late in
 *   a short word ("Lord" held over two chords) shares the word rather than
 *   cutting it into "Lo-rd".
 * - A chord in the gap between words goes on the word after.
 * - A chord past the last word gets a "_" of its own after it, the
 *   placeholder sheets here already use for a chord with no word under it.
 * - Two chords on one word share it, written with a space between, the way
 *   the builder packs them.
 */
export function placeChords(
  lyrics: string,
  chords: { at: number; token: string }[]
): { lyrics: string; row: string[] } {
  let line = lyrics
  let placed = [...chords].sort((a, b) => a.at - b.at)

  // Split words at chords that fall on a later syllable, right to left so
  // earlier columns stay where they are.
  const splits = new Set<number>()
  for (const c of placed) {
    for (const s of slotSpans(line)) {
      if (c.at > s.start && c.at < s.end && c.at - s.start >= 2 && s.end - c.at >= 3) {
        splits.add(c.at)
      }
    }
  }
  for (const at of [...splits].sort((a, b) => b - a)) {
    line = `${line.slice(0, at)}-${line.slice(at)}`
    placed = placed.map((c) => (c.at >= at ? { ...c, at: c.at + 1 } : c))
  }

  const spans = slotSpans(line)
  const bySlot: string[][] = spans.map(() => [])
  const after: string[] = []
  for (const c of placed) {
    let i = -1
    for (let j = 0; j < spans.length; j++) if (spans[j].start <= c.at) i = j
    if (i === -1) {
      if (spans.length > 0) bySlot[0].push(c.token)
      else after.push(c.token)
      continue
    }
    if (c.at >= spans[i].end) {
      if (i + 1 < spans.length) bySlot[i + 1].push(c.token)
      else after.push(c.token)
      continue
    }
    bySlot[i].push(c.token)
  }

  const words = line.replace(/\s+/g, ' ').trim()
  const stored = [words, ...after.map(() => '_')].filter(Boolean).join(' ')
  const row = [...bySlot.map((t) => t.join(' ')), ...after]
  return { lyrics: stored, row }
}

export interface Converted {
  sections: ChordSheetSection[]
  chordCount: number
  /** Chord names that could not be read as chords and were left out. */
  unreadable: string[]
}

let idSeq = 0

/**
 * The builder's sections for an imported chart, in the given key.
 *
 * A section of words becomes lyrics with a chord row per line; a line of
 * chords inside it becomes a line of "_" placeholders carrying them, so an
 * intro riff before the first verse line stays where it was. A section with
 * no words at all becomes an instrumental: one row of chords, a "||" between
 * the chart's lines.
 */
export function toSheetSections(song: ImportedSong, keyIdx: number): Converted {
  const unreadable: string[] = []
  let chordCount = 0
  const numbers = (chords: ImportedChord[]) =>
    chords.flatMap((c) => {
      const token = chordToNashville(c.chord, keyIdx)
      if (!token) {
        unreadable.push(c.chord)
        return []
      }
      chordCount++
      return [{ at: c.at, token }]
    })

  const sections = song.sections.map((s): ChordSheetSection => {
    const id = `import-${Date.now()}-${idSeq++}`
    const hasWords = s.lines.some((l) => l.lyrics.trim() !== '')

    if (!hasWords) {
      const row: string[] = []
      s.lines.forEach((l, i) => {
        if (i > 0) row.push(PROGRESSION_END)
        row.push(...numbers(l.chords).map((c) => c.token))
      })
      return { id, type: s.type, lyrics: '', chordTokens: [row] }
    }

    const lyricLines: string[] = []
    const rows: string[][] = []
    for (const l of s.lines) {
      if (l.lyrics.trim() === '') {
        const tokens = numbers(l.chords).map((c) => c.token)
        if (tokens.length === 0) continue
        lyricLines.push(tokens.map(() => '_').join(' '))
        rows.push(tokens)
        continue
      }
      const placed = placeChords(l.lyrics, numbers(l.chords))
      lyricLines.push(placed.lyrics)
      rows.push(placed.row)
    }
    return { id, type: s.type, lyrics: lyricLines.join('\n'), chordTokens: rows }
  })

  return { sections, chordCount, unreadable }
}

/** Every chord in a chart, in order — for guessing its key. */
export function allChords(song: ImportedSong): string[] {
  return song.sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.chord)))
}

/** Sanity check used by the tests: every row lines up with its lyric's slots. */
export function rowsMatchSlots(section: ChordSheetSection): boolean {
  if (!section.lyrics.trim()) return true
  const lines = section.lyrics.split('\n')
  return lines.every(
    (line, i) => getWordSlots(line).length === (section.chordTokens[i] ?? []).length
  )
}
