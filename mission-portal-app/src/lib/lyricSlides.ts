import type { ChordSheet } from '@/types/chordSheet'
import { FOOTER, chordLine, sectionHeading } from '@/lib/chordImport'
import { getPrevMatchingSection, getSectionLabel } from '@/features/worship/chordSheetFormat'
import {
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  splitSpokenKey,
  spokenWords,
} from '@/lib/songRequest'

/**
 * Lyric slides for a song, as Miriam makes them: "make slides for Way Maker"
 * from its chord sheet, or "make slides for this song" with the lyrics pasted
 * after it. All in capitals, a few lines to a slide — as much as a room
 * singing along reads at a glance, and no less — for PowerPoint or Google
 * Slides (lib/pptx).
 *
 * Pure: no React, no platform, nothing read or written.
 */

// ─── Asking for them ────────────────────────────────────────────────────────

export type SlidesAsk =
  /** Lyrics given: pasted after the asking, with the song's name if it was said. */
  | { kind: 'lyrics'; lyrics: string; title: string }
  /** A song by name, to be found among the chord sheets. */
  | { kind: 'song'; name: string }
  /** Slides, but for what isn't said: "make slides for this song", nothing pasted. */
  | { kind: 'which' }

const LEAD = String.raw`^\s*(?:(?:hey|hi|ok|okay)[\s,]+)?(?:miriam[\s,]+)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:need|want|would\s+like|'d\s+like|’d\s+like)\s+(?:you\s+to\s+)?|let'?s\s+|help\s+me\s+|go\s+ahead\s+and\s+)?`
const MAKE = String.raw`(?:create|make|build|prepare|prep|generate|put\s+together|do|draft|set\s+up|get|give\s+me|whip\s+up|format)`
const FILL = String.raw`(?:(?:a|an|the|some|me|us|up|out|new|set\s+of|deck\s+of)\s+)*`
const SORT = String.raw`(?:(?:lyrics?|song|worship|google|powerpoint|power\s*point|projector|projection)\s+)*`
const DECK = String.raw`(?:slides?|slide\s*(?:deck|show)|slideshow|deck|powerpoint|power\s*point|pptx?|presentation)`
const FOR = String.raw`(?:\s+(?:for|of|from|with|using)\b\s*(.*))?$`

/** "Make slides for Way Maker", "can you create a PowerPoint for this song". */
const MAKE_SLIDES = new RegExp(`${LEAD}${MAKE}\\s+${FILL}${SORT}${DECK}${FOR}`, 'i')
/** "Slides for Way Maker", "I need lyric slides for this song". */
const SLIDES_FOR = new RegExp(
  `${LEAD}${FILL}(?:lyrics?\\s+)?(?:slides|slide\\s*deck|slideshow)\\s+(?:for|of)\\b\\s*(.*)$`,
  'i'
)
/** "Put Way Maker on slides", "turn these lyrics into slides". */
const INTO_SLIDES = new RegExp(
  `${LEAD}(?:turn|put|make|convert|format|change)\\s+(.+?)\\s+(?:into|onto|on|to|as)\\s+${FILL}${SORT}${DECK}\\s*[.!?]*$`,
  'i'
)

/** The song meant without naming it: "this song", "these lyrics", "the following". */
const THIS =
  /^(?:(?:this|that|these|those|the\s+following|the|my|our)\s*)?(?:song|songs|lyrics?|words|hymn|text)?(?:\s*(?:below|here|above|i\s+(?:just\s+)?(?:pasted|sent|typed|copied)|i'?m\s+pasting))?$/i
/** "this song called Way Maker". */
const THIS_CALLED =
  /^(?:this|that|the(?:\s+following)?|my|our)\s+(?:song|hymn|one)\s*(?:called|named|titled|,|—|–|-)\s*(.+)$/i
/** "this song You are here, moving in our midst…": the lyrics begun on the same line. */
const THIS_THEN = /^(?:this|these|the\s+following)\s+(?:song|lyrics?|words)\s*[-—–]?\s+(.+)$/i
/** Words that end a request, and aren't the song: "…please", "…thanks". */
const TRAILING =
  /[\s,]*(?:please|thanks|thank\s+you|for\s+me|for\s+sunday|for\s+service)?[\s.!?]*$/i

/**
 * Lyric slides asked for, and for what — or null when it isn't that. The
 * asking is the first line (or, failing that, the last); what is pasted on the
 * other lines is the lyrics. Read from the text as typed: the lines and their
 * breaks are the song's.
 */
export function slidesAsked(text: string): SlidesAsk | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const filled = lines.map((l) => l.trim()).filter(Boolean)
  if (filled.length === 0) return null
  const first = filled[0]
  let asking = askingIn(first)
  let rest = lines.slice(lines.findIndex((l) => l.trim() === first) + 1)
  if (!asking && filled.length > 1) {
    const last = filled[filled.length - 1]
    asking = askingIn(last)
    let end = lines.length - 1
    while (end >= 0 && lines[end].trim() !== last) end--
    rest = lines.slice(0, end)
  }
  if (!asking) return null

  // "…this song: You are here…": the lyrics may start after a colon.
  let target = asking.target
  let inline = ''
  const colon = target.indexOf(':')
  if (colon >= 0) {
    inline = target.slice(colon + 1).trim()
    target = target.slice(0, colon)
  }
  target = target.replace(TRAILING, '').trim()
  target = target.replace(/^[“"'‘]+|[”"'’]+$/g, '').trim()

  let name = ''
  const called = target.match(THIS_CALLED)
  const then = target.match(THIS_THEN)
  if (called) name = called[1].replace(/^[“"'‘]+|[”"'’]+$/g, '').trim()
  else if (then && !THIS.test(target)) inline = [then[1], inline].filter(Boolean).join('\n')
  else if (!THIS.test(target)) name = target.replace(/^(?:the\s+)?(?:song|hymn)\s+/i, '').trim()

  const lyrics = [inline, ...rest].join('\n').trim()
  if (looksLikeLyrics(lyrics)) return { kind: 'lyrics', lyrics, title: name }
  if (name) return { kind: 'song', name }
  return { kind: 'which' }
}

function askingIn(line: string): { target: string } | null {
  const made = line.match(MAKE_SLIDES)
  if (made) return { target: made[1] ?? '' }
  const slides = line.match(SLIDES_FOR)
  if (slides) return { target: slides[1] ?? '' }
  const into = line.match(INTO_SLIDES)
  if (into) return { target: into[1] }
  return null
}

/** Enough to be a song's words, not a stray "please" on a line of its own. */
export function looksLikeLyrics(text: string): boolean {
  const sung = pastedSections(text).sections.flatMap((s) => s.lines)
  return sung.length >= 2 || sung.join(' ').split(/\s+/).filter(Boolean).length >= 5
}

// ─── The words ──────────────────────────────────────────────────────────────

/** A part of the song — a verse, a chorus — and its lines, as sung. */
export interface LyricSection {
  /** "Verse 1", "Chorus"; '' when the lyrics don't say. */
  label: string
  lines: string[]
}

/** Spaces made one, and none before a comma. */
function tidy(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?’”)])/g, '$1')
    .replace(/([(“‘])\s+/g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .trim()
}

/**
 * A line of a chord sheet's lyrics as it is sung. The builder marks a chord
 * held past the words with "_", and splits a word with "-" to put chords over
 * its syllables ("gov-erned"): the "_" go, and the word is whole again.
 */
export function sungLine(line: string): string {
  return tidy(
    line
      .replace(/_+/g, ' ')
      // A dash standing alone, between words: no word at all.
      .replace(/(^|\s)-+(?=\s|$)/g, '$1')
      // A word split into syllables: one word again ("Way-mak-er", "gov- erned").
      .replace(/(\S)[ \t]*-+[ \t]*(?=\S)/g, '$1')
      // What is left at a word's end or start ("Lord-", a line begun "-erned").
      .replace(/-+(\s|$)/g, '$1')
      .replace(/(^|\s)-+/g, '$1')
  )
}

/**
 * The sections of a chord sheet as sung, in order: a section marked the same
 * as an earlier one ("Chorus — same as Chorus") sung again with its words,
 * as the sheet's viewer shows it. Instrumental sections have no words, and no
 * slides. A blank line within a section's lyrics starts a new slide.
 */
export function sheetSections(sheet: Pick<ChordSheet, 'sections'>): LyricSection[] {
  const out: LyricSection[] = []
  for (const section of sheet.sections) {
    const content = section.sameAsPrevious
      ? (getPrevMatchingSection(sheet.sections, section.id) ?? section)
      : section
    const label = getSectionLabel(sheet.sections, section.id)
    for (const stanza of (content.lyrics ?? '').split(/\n\s*\n/)) {
      const lines = stanza.split('\n').map(sungLine).filter(Boolean)
      if (lines.length) out.push({ label, lines })
    }
  }
  return out
}

/** "Key - G", "Tempo: 72", "Time - 4/4": about the song, not of it. */
const METADATA = /^(?:key|tempo|bpm|time(?:\s+signature)?|capo)\s*[-:=]/i
/** "Repeat Chorus", "(repeat chorus)", "Sing Chorus": a part sung again. */
const REPEAT_OF = /^[[(]?\s*(?:repeat|rpt\.?|sing|back\s+to)\s+(?:the\s+)?(.+?)\s*[\])]?\s*:?$/i
/** "(x2)", "x3", "2x", "(repeat)" at a line's end: sung again, shown once. */
const REPEAT_MARK = /\s*[[(]?\s*(?:x\s?\d+|\d+\s?x|repeat(?:\s+\d+x)?|rpt)\s*[\])]?\s*$/i
/** A ChordPro directive: {title: …}, {soc}, {c: Chorus}. */
const DIRECTIVE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i
/** "1. Amazing grace": a hymn's verse number. */
const VERSE_NUMBER = /^\d+[.)]\s+/

/** A pasted line as sung: chords in brackets out, a repeat mark off its end. */
function pastedLine(line: string): string {
  return tidy(
    line
      .replace(/\[[^\]]*\]/g, '')
      .replace(/_+/g, ' ')
      .replace(REPEAT_MARK, '')
  )
}

/**
 * Lyrics as pasted — from a lyrics site, SongSelect, a chart with chords over
 * the words, a ChordPro file — as the song's sections. Headings ("Verse 1",
 * "[Chorus]") and blank lines divide it; chords, copyright lines and "Key - G"
 * are left out. A heading with no words under it ("Chorus" again, "Repeat
 * Chorus") is that part sung again. A line or two before the first heading
 * is the title (and who wrote it), as such sites put them — and the paste
 * starting with the title given (`known`) is not sung either.
 */
export function pastedSections(
  text: string,
  known = ''
): {
  title: string
  artist: string
  sections: LyricSection[]
} {
  type Open = { label: string; type: string; lines: string[]; heading: boolean }
  const blocks: Open[] = []
  let title = ''
  let current: Open | null = null
  // A heading with no words yet: anything sung under it is its.
  const close = () => {
    current = null
  }
  const heading = (label: string, type: string) => {
    current = { label, type, lines: [], heading: true }
    blocks.push(current)
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      // A blank line ends the words above it; under a heading still waiting
      // for its words, it's only spacing.
      if (current && (current as Open).lines.length) close()
      continue
    }
    const directive = line.match(DIRECTIVE)
    if (directive) {
      const name = directive[1].toLowerCase()
      const value = (directive[2] ?? '').trim()
      if (name === 'title' || name === 't') title = value
      else if (/^(start_of_chorus|soc)$/.test(name)) heading(value || 'Chorus', 'chorus')
      else if (/^(start_of_|so|comment|c|ci|cb)/.test(name)) {
        const h = sectionHeading(value)
        if (h) heading(h.label, h.type)
      } else if (/^(end_of_|eo)/.test(name)) close()
      continue
    }
    if (FOOTER.test(line) || METADATA.test(line)) continue
    const h = sectionHeading(line)
    if (h) {
      heading(h.label.replace(REPEAT_MARK, '').trim(), h.type)
      continue
    }
    const again = line.match(REPEAT_OF)
    const repeated = again ? sectionHeading(again[1]) : null
    if (repeated) {
      heading(repeated.label.replace(REPEAT_MARK, '').trim(), repeated.type)
      close()
      continue
    }
    if (chordLine(line)) continue
    const sung = pastedLine(line)
    if (!sung || !/[A-Za-z0-9\u00C0-\u024F]/.test(sung)) continue
    if (!current) {
      current = { label: '', type: '', lines: [], heading: false }
      blocks.push(current)
    }
    const into = current as Open
    into.lines.push(into.lines.length ? sung : sung.replace(VERSE_NUMBER, ''))
  }

  // A line or two before the first heading, with headings after: the title
  // (and the artist). With the title given, only if it is that.
  let artist = ''
  const top = blocks[0]
  const headed = blocks.findIndex((b) => b.heading) === 1
  if (top && !top.heading && top.lines.length <= 2) {
    const [name, by] = top.lines
    const isTitle = known
      ? sameWords(name, known)
      : headed && !/[,;]$/.test(name) && width(name.toUpperCase()) <= ROW_EM * 2
    if (isTitle) {
      blocks.shift()
      title ||= name
      artist = by ?? ''
    }
  } else if (top && known && sameWords(top.lines[0] ?? '', known)) {
    // The title on a line of its own, the words straight after it.
    top.lines.shift()
  }

  // A heading with no words: that part sung again — the one of the same name,
  // else the last of its kind.
  const sections: LyricSection[] = []
  const sung: Open[] = []
  const bare = (label: string) => label.toLowerCase().replace(/\s+/g, ' ')
  for (const block of blocks) {
    if (block.lines.length) {
      sung.push(block)
      sections.push({ label: block.label, lines: block.lines })
      continue
    }
    const same =
      [...sung].reverse().find((b) => bare(b.label) === bare(block.label)) ??
      (block.type ? [...sung].reverse().find((b) => b.type === block.type) : undefined)
    if (same) sections.push({ label: block.label, lines: same.lines })
  }
  return { title, artist, sections: sections.flatMap(splitRunOn) }
}

/**
 * Lyrics pasted as one long line, as some apps flatten them: broken where the
 * song has its own breaks — a "/" between lines, or the end of a sentence.
 */
function splitRunOn(section: LyricSection): LyricSection {
  const lines = section.lines.flatMap((line) => {
    const parts = line.split(/\s+\/+\s+|\s*\/{2,}\s*/)
    return parts.flatMap((part) =>
      width(part.toUpperCase()) > ROW_EM * 2
        ? part
            .replace(/([.!?;])\s+/g, '$1\n')
            .split('\n')
            .map((p) => p.trim())
        : [part]
    )
  })
  return { label: section.label, lines: lines.filter(Boolean) }
}

// ─── The slides ─────────────────────────────────────────────────────────────

export type LyricSlide =
  | { kind: 'title'; title: string; artist: string }
  /** `label`: the section it is from; `lines`: the rows of words as they stand on it. */
  | { kind: 'lyrics'; label: string; lines: string[] }

export interface LyricDeck {
  /** What the file is called: the song's title, or its first line. */
  name: string
  slides: LyricSlide[]
}

/** The lyrics' size on a slide, in points: read from the back of a room. */
export const LYRIC_PT = 40
/**
 * A row's width, in ems of the lyrics' size: the text box is 12⅓ inches
 * across, within its margins 873 points — 21.8 ems at 40 points, a line of
 * the song of thirty-odd capitals. A little is kept back for a font drawn
 * wider than Arial, so a row is never wrapped where it wasn't meant to be.
 */
export const ROW_EM = 21
/** Rows on a slide at most: four, read at a glance from the back of a room. */
export const MAX_ROWS = 4
/** Lines of the song on a slide at most. */
const MAX_LINES = 4
/**
 * The words on a slide at most, in ems: three full rows' worth, some ninety
 * capitals. Four short lines ("HOLY, HOLY, HOLY! / LORD GOD ALMIGHTY! / …")
 * share a slide; four long ones are two slides of two.
 */
export const MAX_EM = 60

/** Arial Bold's widths, in thousandths of an em, for capitals and what goes with them. */
const WIDTHS: Record<string, number> = {
  ' ': 278,
  '!': 333,
  '"': 474,
  "'": 238,
  '’': 278,
  '‘': 278,
  '“': 500,
  '”': 500,
  '(': 333,
  ')': 333,
  ',': 278,
  '-': 333,
  '.': 278,
  ':': 333,
  ';': 333,
  '?': 611,
  '&': 722,
  '—': 1000,
  '–': 556,
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
}

/** How wide a row of capitals is, in ems. */
export function width(text: string): number {
  let w = 0
  for (const ch of text) w += WIDTHS[ch] ?? (/\d/.test(ch) ? 556 : 722)
  return w / 1000
}

/** Words that lead into the next: a row ending on one reads as cut off ("…THE MORNING OUR"). */
const LEADS_ON = new Set(
  'A AN THE OF TO IN ON AT BY FOR WITH FROM AND OR BUT MY OUR YOUR HIS HER THEIR THY I YOU WE IS ARE BE'.split(
    ' '
  )
)

/**
 * A line of the song as rows on a slide. One that runs wider than a row is
 * broken where it reads best: after a comma, or near its middle — never a
 * word left on its own, nor a row ending on "THE", if it can be helped.
 * "WAY MAKER, MIRACLE WORKER, PROMISE KEEPER" is "WAY MAKER, MIRACLE
 * WORKER," over "PROMISE KEEPER".
 */
export function rowsOf(line: string): string[] {
  if (width(line) <= ROW_EM) return [line]
  const words = line.split(' ')
  const total = width(line)
  let best: { at: number; cost: number } | null = null
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ')
    const right = words.slice(i).join(' ')
    const wl = width(left)
    if (wl > ROW_EM) break
    const wr = width(right)
    // The rest wider than a row is broken again: take as much as fits first.
    let cost = (wr > ROW_EM ? 10 : 0) + Math.abs(wl - wr) / total
    if (/[,;:!?.)—–]$/.test(left)) cost -= 0.3
    if (i === 1 || i === words.length - 1) cost += 0.2
    if (LEADS_ON.has(words[i - 1])) cost += 0.15
    if (!best || cost < best.cost) best = { at: i, cost }
  }
  // One word wider than a row: left whole, to wrap as it must.
  if (!best) return [line]
  return [words.slice(0, best.at).join(' '), ...rowsOf(words.slice(best.at).join(' '))]
}

/**
 * A section's lines, a slide's worth at a time. As few slides as the lines
 * fit on — at most four rows, four lines and MAX_EM of words each — and of
 * the ways to do that, the one that keeps lines in their pairs (the second
 * with the first, as songs rhyme), then the most even: no slide is left with
 * a line the others could have taken.
 */
export function slidesOf(lines: string[]): string[][] {
  const units = lines.flatMap((line) => {
    const rows = rowsOf(line)
    // A line too long for a slide on its own: a slide's worth of rows at a time.
    const parts: string[][] = []
    for (let i = 0; i < rows.length; i += MAX_ROWS) parts.push(rows.slice(i, i + MAX_ROWS))
    return parts
  })
  const n = units.length
  type Best = { slides: number; odd: number; sq: number; from: number }
  const best: (Best | null)[] = [{ slides: 0, odd: 0, sq: 0, from: -1 }]
  for (let i = 1; i <= n; i++) {
    best[i] = null
    let rows = 0
    let ems = 0
    for (let j = i - 1; j >= 0; j--) {
      rows += units[j].length
      ems += units[j].reduce((sum, row) => sum + width(row), 0)
      if (i - j > 1 && (rows > MAX_ROWS || i - j > MAX_LINES || ems > MAX_EM)) break
      const before = best[j]
      if (!before) continue
      const next: Best = {
        slides: before.slides + 1,
        odd: before.odd + (j % 2),
        sq: before.sq + rows * rows,
        from: j,
      }
      const now = best[i]
      if (
        !now ||
        next.slides < now.slides ||
        (next.slides === now.slides &&
          (next.odd < now.odd || (next.odd === now.odd && next.sq < now.sq)))
      )
        best[i] = next
    }
  }
  const slides: string[][] = []
  for (let i = n; i > 0; i = best[i]!.from) slides.unshift(units.slice(best[i]!.from, i).flat())
  return slides
}

/** The song's sections as slides, in capitals, after a title slide when the title is known. */
export function lyricDeck(sections: LyricSection[], title = '', artist = ''): LyricDeck {
  const slides: LyricSlide[] = []
  const name = title.trim()
  if (name) slides.push({ kind: 'title', title: caps(name), artist: caps(artist.trim()) })
  for (const section of sections) {
    for (const lines of slidesOf(section.lines.map(caps).filter(Boolean))) {
      slides.push({ kind: 'lyrics', label: section.label, lines })
    }
  }
  const first = sections[0]?.lines[0] ?? ''
  return { name: name || first.replace(/[,.;:!?]+$/, ''), slides }
}

function caps(text: string): string {
  return tidy(text).toUpperCase()
}

/** Slides from a chord sheet: its lyrics as sung, the chords left out. */
export function deckFromSheet(sheet: Pick<ChordSheet, 'title' | 'artist' | 'sections'>): LyricDeck {
  return lyricDeck(sheetSections(sheet), sheet.title, sheet.artist ?? '')
}

/** Slides from lyrics pasted, with the song's title if it was given. */
export function deckFromLyrics(lyrics: string, title = ''): LyricDeck {
  const named = title.trim()
  const pasted = pastedSections(lyrics, named)
  return lyricDeck(pasted.sections, named || pasted.title, pasted.artist)
}

const sameWords = (a: string, b: string) => spokenWords(a).join(' ') === spokenWords(b).join(' ')

/** The deck as plain text, a slide to a paragraph: for the preview, and to read. */
export function deckText(deck: LyricDeck): string {
  return deck.slides
    .map((s) => (s.kind === 'title' ? [s.title, s.artist].filter(Boolean) : s.lines).join('\n'))
    .join('\n\n')
}

// ─── Finding the song ───────────────────────────────────────────────────────

export type SheetFound<T> = { kind: 'one'; sheet: T } | { kind: 'guess'; sheets: T[] } | null

/**
 * The chord sheet named for slides. Run together or apart ("Waymaker",
 * "Way Maker"), with a key or the artist after it ("Way Maker in G", "Way
 * Maker by Sinach"), as the words it has been heard as before
 * (lib/songAliases), or as the song finder finds it (lib/songRequest). Not
 * plainly one: the nearest titles, to choose from.
 */
export function sheetForSlides<T extends { id: string | number; title: string }>(
  sheets: T[],
  aliases: ReadonlyMap<string, string>,
  name: string
): SheetFound<T> {
  const asked = [name, name.replace(/\s+by\s+.+$/i, '')].filter(
    (n, i, all) => !!n.trim() && all.indexOf(n) === i
  )
  for (const said of asked) {
    const squashed = spokenWords(splitSpokenKey(said).name).join('')
    const whole = sheets.find((s) =>
      [s.title, s.title.replace(/\s*[([].*?[)\]]/g, ' '), ...bracketed(s.title)].some(
        (t) => squashed && spokenWords(t).join('') === squashed
      )
    )
    if (whole) return { kind: 'one', sheet: whole }
    const found = requestFromAliases(aliases, sheets, said) ?? parseSongRequest(sheets, said)
    if (found) return { kind: 'one', sheet: found.sheet }
  }
  const near = closestTitles(sheets, asked[asked.length - 1] ?? name)
  return near.length ? { kind: 'guess', sheets: near } : null
}

const bracketed = (title: string) => [...title.matchAll(/[([](.*?)[)\]]/g)].map((m) => m[1])
