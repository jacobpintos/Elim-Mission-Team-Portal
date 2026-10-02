import { NNS_KEYS } from '@/lib/nashvilleNumbers'

/**
 * A song asked for out loud: "Firm Foundation, key of E", "pull up Holy
 * Forever in B flat", "key of G, Build My Life", or just a title.
 *
 * Only a whole utterance that is a title — give or take a key and a few
 * words of asking ("open", "pull up", "please") — counts. Words sung along
 * to a song are not a request even when they include a title, so the band
 * singing "holy" never opens a song called Holy.
 */
export interface SongRequest<T> {
  sheet: T
  /** As NNS_KEYS names it, or null if no key was said. */
  key: string | null
  minor: boolean
}

/** Spoken text as words: lower case, no punctuation, ♭ and ♯ spelled out. */
function spokenWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/♭/g, ' flat ')
    .replace(/[♯#]/g, ' sharp ')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** A title as words: in full, and without what is in brackets. */
function titleForms(title: string): string[][] {
  const full = spokenWords(title)
  const bare = spokenWords(title.replace(/\s*[([].*?[)\]]/g, ' '))
  return bare.join(' ') === full.join(' ') ? [full] : [full, bare]
}

const FILLER = new Set([
  'hey',
  'ok',
  'okay',
  'please',
  'can',
  'could',
  'you',
  'lets',
  'let',
  'us',
  'go',
  'to',
  'open',
  'up',
  'pull',
  'bring',
  'show',
  'me',
  'play',
  'do',
  'find',
  'get',
  'load',
  'sing',
  'the',
  'song',
  'now',
  'next',
  'thanks',
  'thank',
  'and',
  'then',
])

/** Letters as speech recognition writes them, sounded out or not. */
const LETTERS: Record<string, number> = {
  c: 0,
  see: 0,
  sea: 0,
  d: 2,
  dee: 2,
  e: 4,
  f: 5,
  ef: 5,
  eff: 5,
  g: 7,
  gee: 7,
  a: 9,
  ay: 9,
  b: 11,
  be: 11,
  bee: 11,
}

/**
 * A key, said: "key of E", "in B flat", "F sharp minor", "the key of Eb",
 * or a bare "G". Null if the words are anything else.
 */
export function spokenKey(words: string[]): { key: string; minor: boolean } | null {
  let w = [...words]
  while (w[0] === 'in' || w[0] === 'on' || w[0] === 'the') w = w.slice(1)
  if (w[0] === 'key') w = w.slice(w[1] === 'of' ? 2 : 1)
  if (w.length === 0) return null
  let semitone: number
  let at = 1
  const glued = w[0].match(/^([a-g])b$/) // "eb", "bb": as typed, not said
  if (glued) semitone = LETTERS[glued[1]] - 1
  else if (w[0] in LETTERS) semitone = LETTERS[w[0]]
  else return null
  if (!glued && (w[1] === 'flat' || w[1] === 'sharp')) {
    semitone += w[1] === 'flat' ? -1 : 1
    at = 2
  }
  let minor = false
  if (w[at] === 'minor' || w[at] === 'min') {
    minor = true
    at += 1
  } else if (w[at] === 'major' || w[at] === 'maj') at += 1
  if (at !== w.length) return null
  return { key: NNS_KEYS[(semitone + 12) % 12], minor }
}

const onlyFiller = (words: string[]) => words.every((w) => FILLER.has(w))

/** The song asked for, if the whole of `text` asks for one. */
export function parseSongRequest<T extends { title: string }>(
  sheets: T[],
  text: string
): SongRequest<T> | null {
  const words = spokenWords(text)
  if (words.length === 0) return null
  let best: { request: SongRequest<T>; length: number } | null = null
  for (const sheet of sheets) {
    for (const form of titleForms(sheet.title)) {
      if (form.length === 0 || (best && form.length <= best.length)) continue
      for (let at = 0; at + form.length <= words.length; at++) {
        if (!form.every((w, i) => words[at + i] === w)) continue
        const before = words.slice(0, at)
        const after = words.slice(at + form.length)
        // Asking words either side; a key before or after, not both.
        const keyAfter = onlyFiller(after) ? null : spokenKey(stripFiller(after))
        const keyBefore = onlyFiller(before) ? null : spokenKey(stripFiller(before))
        if (!onlyFiller(after) && !keyAfter) continue
        if (!onlyFiller(before) && !keyBefore) continue
        if (keyAfter && keyBefore) continue
        const key = keyAfter ?? keyBefore
        best = {
          request: { sheet, key: key?.key ?? null, minor: key?.minor ?? false },
          length: form.length,
        }
        break
      }
    }
  }
  return best?.request ?? null
}

/** Asking words off either end: "please", "pull up", "the". */
function stripFiller(words: string[]): string[] {
  let start = 0
  let end = words.length
  // "the key of" keeps its "the"; spokenKey takes it off.
  while (start < end && FILLER.has(words[start]) && words[start] !== 'the') start++
  while (end > start && FILLER.has(words[end - 1])) end--
  return words.slice(start, end)
}
