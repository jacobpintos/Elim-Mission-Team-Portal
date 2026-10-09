import { NNS_KEYS } from '@/lib/nashvilleNumbers'

/**
 * A song asked for out loud: "Firm Foundation, key of E", "pull up Holy
 * Forever in B flat", "key of G, Build My Life", or just a title.
 *
 * Titles are matched by sound as well as spelling, since speech recognition
 * writes what it thinks it heard in English: "Agnus Dei" comes back as
 * "Agnes Day". And a title's bracketed other name counts on its own —
 * "Ten Thousand Reasons" finds "10,000 Reasons (Ten Thousand Reasons)".
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
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/**
 * A title as words: in full, without what is in brackets, and what is in
 * brackets on its own — "Abba (Arms of a Father)" is asked for either way.
 */
function titleForms(title: string): string[][] {
  const forms = [
    spokenWords(title),
    spokenWords(title.replace(/\s*[([].*?[)\]]/g, ' ')),
    ...[...title.matchAll(/[([](.*?)[)\]]/g)].map((m) => spokenWords(m[1])),
  ].filter((f) => f.length > 0)
  const seen = new Set<string>()
  return forms.filter((f) => {
    const k = f.join(' ')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * How a word sounds, roughly: spellings of one sound made one ("ph" and
 * "f", "c" and "k"), and the vowels after the first letter dropped, as
 * they are what speech recognition most often gets wrong. "agnus" and
 * "agnes" are both "agns"; "dei" and "day" are both "d".
 */
export function soundOf(word: string): string {
  const s = word
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/wh/g, 'w')
    .replace(/^kn/, 'n')
    .replace(/gh/g, '')
    .replace(/dg/g, 'j')
  if (!s) return ''
  const first = /[aeiou]/.test(s[0]) ? 'a' : s[0]
  return (first + s.slice(1).replace(/[aeiouyhw]/g, '')).replace(/(.)\1+/g, '$1')
}

/** Letters to change to turn one word into the other, up to 2. */
function closeness(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return Math.min(prev[b.length], 2)
}

/** 2 for the same word, 1 for one that sounds or is spelled nearly the same, 0 for neither. */
function wordMatch(heard: string, wanted: string): number {
  if (heard === wanted) return 2
  if (/\d/.test(heard) || /\d/.test(wanted)) return 0
  if (Math.min(heard.length, wanted.length) >= 2 && soundOf(heard) === soundOf(wanted)) return 1
  if (Math.min(heard.length, wanted.length) >= 5 && closeness(heard, wanted) <= 1) return 1
  return 0
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
  si: 0,
  d: 2,
  dee: 2,
  di: 2,
  die: 2,
  dy: 2,
  deed: 2,
  e: 4,
  ee: 4,
  f: 5,
  ef: 5,
  eff: 5,
  g: 7,
  gee: 7,
  ge: 7,
  gi: 7,
  jee: 7,
  a: 9,
  ay: 9,
  eh: 9,
  b: 11,
  be: 11,
  bee: 11,
}

/**
 * What a key phrase came out as, by how speech recognition runs its words
 * together: "key of D" as "KFD" or "kod", "in D" as "indie" or "indeed",
 * "in E" as "any", "in the key of" as one blur. Each is put back into words
 * the parser below reads. Only ever tried on what follows (or comes before)
 * a song's title, so a word like "indeed" is a key only there.
 */
function unblur(words: string[]): string {
  let r = words
    .join(' ')
    // "eflat", "dminor": a letter run into what follows it.
    .replace(/\b([a-g])(flat|sharp|minor|major)\b/g, '$1 $2')
    .trim()
  if (r === 'any') return 'e'
  r = r.replace(/^the\s+/, '')
  // "in …" and "on …", spaced or not: "in d", "indie", "insee", "inf".
  const inForm = r.match(/^(?:in|on)\s*(.*)$/)
  if (inForm) {
    r = inForm[1]
    // "in D" heard as "in the".
    if (r === 'the') return 'd'
    r = r.replace(/^the\s+/, '')
  }
  // "key of …": spaced ("key of d", "key d", "key off" for F), or run
  // together into one word ("kfd", "kod", "keyofd") or two ("kf d").
  const t = r.split(' ')
  if (/^k(?:ey|ay|ee)$/.test(t[0])) {
    if (t.length === 2 && t[1] === 'off') return 'f'
    r = t.slice(t[1] === 'of' ? 2 : 1).join(' ')
    if (r === 'the') return 'd'
  } else if (t.length > 1 && soundsLikeKeyOf(t[0])) {
    // Whatever "key of" came out as, by its sound: "kf", "Kyiv", "Kiev",
    // "Q of" (with its "of" after it), "keyoff".
    r = t.slice(t[1] === 'of' || t[1] === 'off' ? 2 : 1).join(' ')
    if (r === 'the') return 'd'
  } else {
    const glued = t[0].match(/^k(?:ey|ay|ee|i)?(?:off|of|o|f|v)?([a-g].*)$/)
    if (glued) r = [glued[1], ...t.slice(1)].join(' ')
  }
  return r
}

/**
 * Whether a word is "key" or "key of" by its sound: k, with an f or v
 * after it and nothing else heard (soundOf drops the vowels). "Kyiv",
 * "Kiev", "kf", "keyof", "q" all are; so is "cave" — harmless, as it only
 * counts beside a title and before a key.
 */
function soundsLikeKeyOf(word: string): boolean {
  // A note's own name is never it: "C sharp" is a key, not "key sharp".
  if (word in LETTERS) return false
  return ['k', 'kf', 'kv'].includes(soundOf(word))
}

/**
 * A key, said: "key of E", "in B flat", "F sharp minor", "the key of Eb",
 * or a bare "G" — and the run-together forms speech recognition makes of
 * them (unblur). Null if the words are anything else.
 */
export function spokenKey(words: string[]): { key: string; minor: boolean } | null {
  const w = unblur(words).split(/\s+/).filter(Boolean)
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

/**
 * Phrases to steer speech recognition towards when a key may be said, so
 * "key of D" is written down as that and not "KFD" to begin with.
 */
export const KEY_HINTS = [
  ...'ABCDEFG'.split('').map((l) => `key of ${l}`),
  ...'ABCDEFG'.split('').map((l) => `in ${l}`),
  'flat',
  'sharp',
  'minor',
]

const onlyFiller = (words: string[]) => words.every((w) => FILLER.has(w))

/** The song asked for, if the whole of `text` asks for one. */
export function parseSongRequest<T extends { title: string }>(
  sheets: T[],
  text: string
): SongRequest<T> | null {
  const words = spokenWords(text)
  if (words.length === 0) return null
  // The title that fits best: most words the same, then the longest.
  let best: { request: SongRequest<T>; score: number; length: number } | null = null
  for (const sheet of sheets) {
    for (const form of titleForms(sheet.title)) {
      for (let at = 0; at + form.length <= words.length; at++) {
        const scores = form.map((w, i) => wordMatch(words[at + i], w))
        // One word of a longer title may be misheard outright: "All Hail
        // King Jesus" came back "Oh Hill King Jesus". Two titles' worth of
        // words have to line up either way, so a line of lyrics is not one.
        const misses = scores.filter((x) => x === 0).length
        if (misses > (form.length >= 3 ? 1 : 0)) continue
        const score = scores.reduce((a, b) => a + b, 0)
        if (best && (score < best.score || (score === best.score && form.length <= best.length)))
          continue
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
          score,
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
  // Nor off the end: "in the" is how "in D" is often heard.
  while (end > start && FILLER.has(words[end - 1]) && words[end - 1] !== 'the') end--
  return words.slice(start, end)
}

/** Words too common to say anything about which title was meant. */
const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'my', 'is', 'for', 'be'])

/**
 * The titles closest to what was said, for the guesses offered when nothing
 * is clear. Each of a title's words is looked for, in order, among the
 * words heard — the same word counting double one that only sounds like
 * it, and two heard words run together ("for ever") counting as one — and
 * the title scores the share of all it could have. Half at least, with one
 * word heard exactly that is not a small one: "of" and "the" are in every
 * other title, and "hill" sounding like "holy" is no reason to offer Holy.
 * Best first.
 */
export function closestTitles<T extends { title: string }>(
  sheets: T[],
  text: string,
  count = 3
): T[] {
  const words = spokenWords(text)
  if (words.length === 0) return []
  const scored: { sheet: T; share: number; points: number }[] = []
  for (const sheet of sheets) {
    let best = { share: 0, points: 0 }
    for (const form of titleForms(sheet.title)) {
      let at = 0
      let points = 0
      let exact = false
      for (const w of form) {
        let found = -1
        let got = 0
        for (let i = at; i < words.length && found < 0; i++) {
          const one = wordMatch(words[i], w)
          const two = i + 1 < words.length ? wordMatch(words[i] + words[i + 1], w) : 0
          if (one || two) {
            found = one >= two ? i : i + 1
            got = Math.max(one, two)
          }
        }
        if (found < 0) continue
        points += got
        if (got === 2 && !SMALL.has(w)) exact = true
        at = found + 1
      }
      const share = points / (2 * form.length)
      if (exact && (share > best.share || (share === best.share && points > best.points))) {
        best = { share, points }
      }
    }
    if (best.share >= 0.5) scored.push({ sheet, ...best })
  }
  return scored
    .sort((a, b) => b.share - a.share || b.points - a.points)
    .slice(0, count)
    .map((s) => s.sheet)
}

/**
 * A key said at the end of whatever was heard — "… in C sharp" — for a
 * song picked from the guesses: it opens in the key that was asked for.
 */
export function trailingKey(text: string): { key: string; minor: boolean } | null {
  const words = spokenWords(text)
  for (let n = Math.min(6, words.length); n >= 1; n--) {
    const key = spokenKey(stripFiller(words.slice(words.length - n)))
    if (key) return key
  }
  return null
}

/**
 * What was said with any key at its end taken off, and asking words either
 * side ("pull up", "please"): the part that names the song. "Oh hill king
 * Jesus and C-sharp" gives "oh hill king jesus", and the key.
 */
export function splitSpokenKey(text: string): {
  name: string
  key: { key: string; minor: boolean } | null
} {
  const words = spokenWords(text)
  for (let n = Math.min(6, words.length - 1); n >= 1; n--) {
    const key = spokenKey(stripFiller(words.slice(words.length - n)))
    if (key) {
      return { name: stripFiller(words.slice(0, words.length - n)).join(' '), key }
    }
  }
  return { name: stripFiller(words).join(' '), key: null }
}

/**
 * A song asked for by words it has been heard as before: the phrases a
 * person corrected by picking the song from the guesses (songAliases).
 * Said again — with or without a key — they open that song.
 */
export function requestFromAliases<T extends { id: string | number; title: string }>(
  aliases: ReadonlyMap<string, string>,
  sheets: T[],
  text: string
): SongRequest<T> | null {
  const { name, key } = splitSpokenKey(text)
  if (!name) return null
  const id = aliases.get(name)
  if (!id) return null
  const sheet = sheets.find((s) => String(s.id) === id)
  if (!sheet) return null
  return { sheet, key: key?.key ?? null, minor: key?.minor ?? false }
}

/**
 * Songs found by typing, for when the right one is not among the guesses:
 * every word typed starts a word of the title or the artist ("hail king",
 * "agn", "hillsong breathe"). Failing that, titles every word typed sounds
 * like a word of ("agnes day"), then the titles closest to what was typed,
 * the way they are found from speech. Alphabetical.
 */
export function searchSongs<T extends { title: string; artist?: string }>(
  sheets: T[],
  query: string,
  count = 8
): T[] {
  const typed = spokenWords(query)
  if (typed.length === 0) return []
  const hits = sheets.filter((s) => {
    const words = spokenWords(`${s.title} ${s.artist ?? ''}`)
    return typed.every((t) => words.some((w) => w.startsWith(t)))
  })
  // Typed as it sounds ("agnes day"): every word like one of the title's.
  const alike = hits.length
    ? hits
    : sheets.filter((s) => {
        const words = spokenWords(s.title)
        return typed.every((t) => words.some((w) => wordMatch(t, w) > 0))
      })
  const found = alike.length ? alike : closestTitles(sheets, query, count)
  return [...found].sort((a, b) => a.title.localeCompare(b.title)).slice(0, count)
}
