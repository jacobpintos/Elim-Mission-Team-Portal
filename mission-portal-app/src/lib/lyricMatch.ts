/**
 * Which song is being sung: a transcript, as the phone's speech recognition
 * heard it, matched against the lyrics of every chord sheet.
 *
 * Lyrics are kept as the sheets have them — syllables split with hyphens
 * ("gov-erned") and "_" holding a place for a chord after the last word — so
 * both are taken out before anything is compared: "gov-erned" is "governed",
 * and "_" is nothing. Punctuation and case go the same way.
 *
 * A song is found by the pairs of words it shares with what was heard — two
 * words in order say far more than one alone — each weighted by how few
 * songs have it: "of my" or "you are" turn up in half the library and count
 * for almost nothing; "wretch like" names one song. Speech recognition
 * mishears sung words, so a heard word close enough to one of a song's own
 * ("grays" for "grace") counts as that word.
 *
 * Pure, so it can be tested without a microphone.
 */

export interface LyricSource {
  id: string
  title: string
  /** The song's sections, in order. */
  sections: { id: string; lyrics: string }[]
}

export interface LyricIndex {
  songs: IndexedSong[]
  /** How many songs have each word pair. */
  pairSongs: Map<string, number>
}

interface IndexedSong {
  id: string
  title: string
  words: Set<string>
  pairs: Set<string>
  /** Where each pair first appears: section, and line within it. */
  pairPlace: Map<string, Place>
  /** How many times each pair appears in the song. */
  pairCount: Map<string, number>
}

interface Place {
  sectionId: string
  /** The line of the section's lyrics, counting from 0, blank lines included. */
  line: number
}

export interface LyricMatch {
  id: string
  title: string
  score: number
  /** How many of the heard word pairs the song has. */
  pairs: number
  /**
   * Where the singing had got to: the section, and the line within it, of
   * the latest words heard that can be placed.
   */
  sectionId: string | null
  line: number | null
}

/** Words, as compared: no hyphens or placeholders, punctuation or case. */
export function lyricWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '') // don't → dont, as recognisers write it either way
    .replace(/(\w)-(?=\w)/g, '$1') // gov-erned → governed
    .replace(/[_\-–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const pair = (a: string, b: string) => `${a} ${b}`

export function buildLyricIndex(sources: LyricSource[]): LyricIndex {
  const pairSongs = new Map<string, number>()
  const songs = sources.map((src) => {
    const words = new Set<string>()
    const pairs = new Set<string>()
    const pairPlace = new Map<string, Place>()
    const pairCount = new Map<string, number>()
    for (const section of src.sections) {
      // Pairs run across a section's lines — a line sung is often the end of
      // one and the start of the next — but not from one section into another.
      // Each pair is placed at the line its second word is on.
      const w: { word: string; line: number }[] = []
      section.lyrics.split('\n').forEach((text, line) => {
        for (const word of lyricWords(text)) w.push({ word, line })
      })
      w.forEach(({ word }) => words.add(word))
      for (let i = 0; i + 1 < w.length; i++) {
        const p = pair(w[i].word, w[i + 1].word)
        pairs.add(p)
        pairCount.set(p, (pairCount.get(p) ?? 0) + 1)
        if (!pairPlace.has(p)) pairPlace.set(p, { sectionId: section.id, line: w[i + 1].line })
      }
    }
    for (const p of pairs) pairSongs.set(p, (pairSongs.get(p) ?? 0) + 1)
    return { id: src.id, title: src.title, words, pairs, pairPlace, pairCount }
  })
  return { songs, pairSongs }
}

/** Edit distance, stopping early once it is past `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

/**
 * The song's own word for a heard one: the same word, or — four letters and
 * up, where a slip is a slip and not a different word — one a letter off.
 */
function asSongWord(heard: string, song: IndexedSong): string {
  if (song.words.has(heard) || heard.length < 4) return heard
  for (const w of song.words) if (w.length >= 4 && within(heard, w, 1)) return w
  return heard
}

/** Songs ranked by how much of what was heard they hold; best first. */
export function rankSongs(index: LyricIndex, transcript: string): LyricMatch[] {
  const heard = lyricWords(transcript)
  if (heard.length < 2) return []
  const n = index.songs.length
  const results: LyricMatch[] = []
  for (const song of index.songs) {
    const words = heard.map((w) => asSongWord(w, song))
    const counted = new Set<string>()
    const matched: string[] = [] // in the order heard
    let score = 0
    for (let i = 0; i + 1 < words.length; i++) {
      const p = pair(words[i], words[i + 1])
      if (!song.pairs.has(p)) continue
      matched.push(p)
      if (counted.has(p)) continue
      counted.add(p)
      score += Math.log((n + 1) / (index.pairSongs.get(p) ?? 1))
    }
    if (score <= 0) continue
    // Where the singing is now: the latest pair heard that appears once in
    // the song, so it can only be one place; failing that, the latest.
    const recent = matched.slice(-6).reverse()
    const latest = recent.find((p) => song.pairCount.get(p) === 1) ?? recent[0]
    const place = latest ? song.pairPlace.get(latest) : undefined
    results.push({
      id: song.id,
      title: song.title,
      score,
      pairs: counted.size,
      sectionId: place?.sectionId ?? null,
      line: place?.line ?? null,
    })
  }
  return results.sort((a, b) => b.score - a.score)
}

/**
 * Enough heard that is this song's alone, and clearly ahead of the next —
 * and at least three pairs, about four words in a row: rarity is judged
 * against the library, and in a small one "this is my" belongs to one song.
 */
export const MIN_SCORE = 4
export const MIN_PAIRS = 3
export const LEAD = 1.6

/** The song to open, once one is certain enough; null until then. */
export function confidentMatch(ranked: LyricMatch[]): LyricMatch | null {
  const [best, next] = ranked
  if (!best || best.score < MIN_SCORE || best.pairs < MIN_PAIRS) return null
  if (next && best.score < next.score * LEAD) return null
  return best
}

/**
 * Words to steer the recogniser towards — song titles and each song's least
 * common pairs — since a sung "wretch" is otherwise as likely heard "rich".
 * iOS takes a hundred phrases at most.
 */
export function hintPhrases(index: LyricIndex, max = 100): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (p: string) => {
    if (out.length >= max || seen.has(p)) return
    seen.add(p)
    out.push(p)
  }
  for (const song of index.songs) add(song.title)
  const rare = index.songs.map((song) =>
    [...song.pairs].sort((a, b) => (index.pairSongs.get(a) ?? 0) - (index.pairSongs.get(b) ?? 0))
  )
  for (let k = 0; out.length < max && rare.some((r) => k < r.length); k++) {
    for (const r of rare) if (k < r.length) add(r[k])
  }
  return out
}
