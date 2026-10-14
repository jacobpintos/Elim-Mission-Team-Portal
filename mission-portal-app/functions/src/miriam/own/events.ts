import { nameWords, soundOf } from '../names'
import { isWord } from './encoder'

/**
 * The events a request names, among the titles this person can see — and the
 * request with each name read as "the event", so that what is asked is what
 * she reads (./understand), not which event.
 *
 * A name is a run of the request's words each of which is a word of the
 * title — as written, nearly so, by sound, or two run together — covering at
 * least half the title ("revival" for Revival in the Heartland). Stricter
 * than finding an event by a name already known to be one (../names): here
 * any word might be one, so "me" is never Men's Breakfast, nor "thanks"
 * Thanksgiving. A word that names a day or a kind of event — "Sunday",
 * "night", "church" — never names one alone, unless it is the whole title.
 */

export interface Mention {
  /** The words as said. */
  said: string
  /** The titles they fit, best first. */
  titles: string[]
  score: number
}

/** Days and times, never an event's name on their own. */
const DATE_WORDS = new Set([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'today',
  'tonight',
  'tomorrow',
  'week',
  'weekend',
  'month',
  'morning',
  'afternoon',
  'evening',
  'day',
  'year',
])
/** Kinds of event, and other words too common to name one alone. */
const KIND_WORDS = new Set([
  'night',
  'service',
  'services',
  'meeting',
  'event',
  'events',
  'practice',
  'study',
  'team',
  'group',
  'worship',
  'church',
  'trip',
  'party',
  'class',
  'gathering',
  'rehearsal',
  'bible',
  'prayer',
  'youth',
  'kids',
  'family',
  'fall',
  'spring',
  'summer',
  'winter',
  'christmas',
  'easter',
  'thanksgiving',
])
/** Words of the asking, never part of a name. */
const NOT_NAMES = new Set([
  ...['i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'it', 'its', 'they', 'them'],
  ...['he', 'him', 'his', 'she', 'her', 'there', 'here', 'this', 'that', 'what', 'whats'],
  ...['when', 'whens', 'where', 'wheres', 'who', 'whos', 'which', 'how', 'why', 'is', 'are'],
  ...['was', 'be', 'been', 'am', 'do', 'does', 'did', 'can', 'cant', 'could', 'will', 'wont'],
  ...['would', 'should', 'need', 'have', 'has', 'had', 'get', 'got', 'go', 'going', 'come'],
  ...['coming', 'make', 'take', 'let', 'up', 'out', 'off', 'down', 'over', 'with', 'about'],
  ...['from', 'into', 'all', 'any', 'some', 'not', 'no', 'yes', 'please', 'thanks', 'hey'],
  ...['miriam', 'time', 'start', 'starts', 'begin', 'wear', 'dress', 'code', 'remind'],
  ...['set', 'reminder', 'tell', 'say', 'said', 'know', 'like', 'just', 'also', 'again'],
  ...['next', 'last', 'first', 'only', 'part', 'half', 'late', 'early', 'there', 'be'],
])
/** Said before a name, and read with it: "the retreat" → "the event". */
const LEADING = new Set(['the', 'our', 'my', 'this', 'that', 'next', 'a', 'an'])

/** Letters to change to turn one word into the other. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Whether a word said is a word of a title: the same; or, for a word that
 * isn't an ordinary one (misheard: "hardland"), nearly, by sound, or begun at
 * length — never "picking" for "picnic", or "might" for "night".
 */
function fits(heard: string, wanted: string): boolean {
  if (heard === wanted || heard + 's' === wanted || heard === wanted + 's') return true
  if (/\d/.test(heard) || /\d/.test(wanted) || isWord(heard)) return false
  const short = Math.min(heard.length, wanted.length)
  if (short >= 5 && soundOf(heard) === soundOf(wanted)) return true
  if (short >= 5 && distance(heard, wanted) <= 1) return true
  if (short >= 8 && distance(heard, wanted) <= 2) return true
  // "revive" for "revival": most of it.
  return heard.length >= 4 && wanted.startsWith(heard) && heard.length >= 0.6 * wanted.length
}

/** A request's words, as matched: lowercase, without punctuation or a possessive "'s". */
const plain = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’']s$/, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')

/** How a run of words fits a title: the share of its words in it, and of its words covered. */
function fitOf(span: string[], title: string[]): { p: number; r: number } | null {
  const content = span.filter((w) => w && !NOT_NAMES.has(w) && nameWords(w).length > 0)
  if (content.length === 0) return null
  const covered = new Set<number>()
  let fitted = 0
  for (let i = 0; i < content.length; i++) {
    const w = content[i]
    let ok = false
    title.forEach((t, j) => {
      if (fits(w, t)) {
        covered.add(j)
        ok = true
      }
    })
    // Two words said for one: "heart land" ~ "heartland".
    const next = content[i + 1]
    if (!ok && next) {
      title.forEach((t, j) => {
        if (fits(w + next, t)) {
          covered.add(j)
          ok = true
        }
      })
      if (ok) {
        fitted += 2
        i++
        continue
      }
    }
    if (ok) fitted++
  }
  return { p: fitted / content.length, r: covered.size / title.length }
}

export function mentionsIn(
  text: string,
  titles: readonly string[]
): { masked: string; mentions: Mention[] } {
  const raw = text.split(/\s+/).filter(Boolean)
  const words = raw.map(plain)
  const unique = [...new Set(titles)].filter((t) => nameWords(t).length > 0)
  const titleWords = new Map(unique.map((t) => [t, nameWords(t)]))
  const isName = (w: string) => !!w && !NOT_NAMES.has(w) && nameWords(w).length > 0

  type Found = { start: number; end: number; title: string; score: number }
  const found: Found[] = []
  for (const title of unique) {
    const tw = titleWords.get(title)!
    for (let start = 0; start < words.length; start++) {
      if (!isName(words[start])) continue
      for (let end = start + 1; end <= Math.min(words.length, start + tw.length + 2); end++) {
        if (!isName(words[end - 1])) continue
        const fit = fitOf(words.slice(start, end), tw)
        if (!fit || fit.p < 1 || fit.r < 0.5) continue
        const content = words.slice(start, end).filter(isName)
        // "Sunday", "night", "church": a name only when it is the whole title.
        if (content.length === 1 && fit.r < 1) {
          const w = content[0]
          if (DATE_WORDS.has(w) || KIND_WORDS.has(w)) continue
        }
        found.push({ start, end, title, score: fit.r })
      }
    }
  }
  // The best runs that don't overlap; each with every title it fits as well.
  found.sort((a, b) => b.score - a.score || b.end - b.start - (a.end - a.start))
  const taken: Found[] = []
  for (const f of found) {
    if (taken.some((t) => f.start < t.end && t.start < f.end)) continue
    taken.push(f)
  }
  taken.sort((a, b) => a.start - b.start)
  const mentions: Mention[] = taken.map((t) => ({
    said: raw.slice(t.start, t.end).join(' '),
    titles: [
      ...new Set(
        found
          .filter((f) => f.start === t.start && f.end === t.end)
          .sort((a, b) => b.score - a.score)
          .map((f) => f.title)
      ),
    ],
    score: t.score,
  }))
  // Read with each name as "the event", a word before it ("the", "our") with it.
  const masked: string[] = []
  let i = 0
  for (const t of taken) {
    let start = t.start
    while (start > i && LEADING.has(words[start - 1])) start--
    masked.push(...raw.slice(i, start), 'the event')
    // Kept: what ends the name — "Revival?" → "the event?".
    const tail = raw[t.end - 1].match(/[^\p{L}\p{N}]+$/u)?.[0] ?? ''
    if (tail) masked[masked.length - 1] += tail
    i = t.end
  }
  masked.push(...raw.slice(i))
  return { masked: masked.join(' '), mentions }
}
