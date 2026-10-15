import { nameWords, soundOf } from './names'

/**
 * Which of several names was meant by what was said, and how sure that is —
 * an item on a food sheet, a task, a notification: shared by the app
 * (src/lib/miriamReplies) and the server (./own/food), so both pick the same.
 *
 * Sure, and it is taken as it is; likely, and she asks whether that is what
 * was meant, naming it; several alike, and she asks which.
 */

/** Squashed for comparing: "Pot-roast" and "potroast" alike. */
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export type Picked<T> =
  /** Plainly this one. */
  | { kind: 'sure'; item: T }
  /** Probably this one, but not certain: asked about. `others`: the rest that fit at all. */
  | { kind: 'likely'; item: T; others: T[] }
  /** Several fit about as well: asked which, best first. */
  | { kind: 'which'; items: T[] }
  | { kind: 'none' }

/** A word's ending that doesn't change what it names: "drinks", "booking", "25th". */
const ENDING = /^(?:s|es|ed|d|ing|er|ers|'s)$/
const ORDINAL_END = /^(?:st|nd|rd|th)$/

/** Letters to change to turn one word into the other, up to 3. */
function changes(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
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
 * How well a word heard fits a word of a name: 1 for the same, or the start of
 * it ("serm" — "sermon"), or it with an ending ("drinks" — "drink"); 0.8 for
 * one that sounds or is spelled nearly the same.
 *
 * Stricter than functions/src/miriam/names, which takes any longer word that
 * begins with a name's: there a heard "potluck" is "pot", which, matching an
 * item on a food sheet, would be "Pot roast".
 */
function wordFits(heard: string, wanted: string): number {
  if (heard === wanted) return 1
  if (/\d/.test(heard) || /\d/.test(wanted)) {
    return heard.startsWith(wanted) && ORDINAL_END.test(heard.slice(wanted.length)) ? 1 : 0
  }
  if (heard.length >= 3 && wanted.startsWith(heard)) return 1
  if (heard.startsWith(wanted) && ENDING.test(heard.slice(wanted.length))) return 1
  if (Math.min(heard.length, wanted.length) >= 3 && soundOf(heard) === soundOf(wanted)) return 0.8
  if (Math.min(heard.length, wanted.length) >= 5 && changes(heard, wanted) <= 1) return 0.8
  if (Math.min(heard.length, wanted.length) >= 8 && changes(heard, wanted) <= 2) return 0.8
  return 0
}

/**
 * How well what was said fits a name, 0 to 1: the share of the words said
 * found in it — as written, by sound, or two run together ("pot roast" and
 * "potroast", either way round).
 */
export function fitScore(name: string, said: string): number {
  const heard = nameWords(said)
  const wanted = nameWords(name)
  if (heard.length === 0 || wanted.length === 0) return 0
  const joinedWanted = wanted.slice(1).map((w, i) => wanted[i] + w)
  const fits = heard.map((h, i) => {
    let best = Math.max(0, ...wanted.map((w) => wordFits(h, w)))
    if (best < 1) best = Math.max(best, ...joinedWanted.map((w) => (h === w ? 1 : 0)))
    const next = heard[i + 1]
    if (best < 1 && next) best = Math.max(best, ...wanted.map((w) => (h + next === w ? 1 : 0)))
    const prev = heard[i - 1]
    if (best < 1 && prev) best = Math.max(best, ...wanted.map((w) => (prev + h === w ? 1 : 0)))
    return best
  })
  return fits.reduce((a, b) => a + b, 0) / heard.length
}

/**
 * How much of a name was said, by its words as written — not as they sound,
 * which would make "Sunday" "sound" and count a word of the name that wasn't
 * said. "sound check" is all of "Sound check", half of "Sound check for youth night".
 */
function coverage(name: string, said: string): number {
  const want = nameWords(name)
  const have = nameWords(said)
  if (want.length === 0) return 0
  const found = want.filter((w) =>
    have.some(
      (h) =>
        h === w ||
        (h.length >= 3 && w.startsWith(h)) ||
        (h.startsWith(w) && ENDING.test(h.slice(w.length)))
    )
  )
  return found.length / want.length
}

/** Below this, a name is not taken to fit at all. */
const FITS = 0.5
/** Within this of the best, another fits about as well. */
const CLOSE = 0.15

/**
 * Which of these was meant by what was said, and how sure that is. Words are
 * matched as speech recognition hears them (fitScore): spelling, sound, and
 * words run together — "potroast" fits "Pot roast".
 *
 * Sure: the same name, or every word said found in it and nothing else as
 * close. Likely: the best of a few, clearly ahead, but not every word found.
 * Several about as close: which. `limit`: how many are offered to choose from.
 * Ties are told apart by how much of each name was said.
 */
export function pickBest<T>(
  items: T[],
  label: (item: T) => string,
  said: string,
  limit = 3,
  /** How well a name must fit to count at all: higher for people, whose every word matters. */
  minFit = FITS
): Picked<T> {
  const asked = squash(said)
  if (!asked || items.length === 0) return { kind: 'none' }
  const same = items.filter((item) => squash(label(item)) === asked)
  if (same.length === 1) return { kind: 'sure', item: same[0] }

  const scored = items
    .map((item) => ({
      item,
      fit: fitScore(label(item), said),
      back: coverage(label(item), said),
    }))
    .filter((s) => s.fit >= minFit)
    .sort((a, b) => b.fit - a.fit || b.back - a.back)
  if (scored.length === 0) return { kind: 'none' }

  const [top] = scored
  const close = scored.filter((s) => s.fit >= top.fit - CLOSE)
  if (close.length > 1) {
    // As close by the words said, but one is all but named outright.
    const [first, second] = close
    if (first.fit >= 0.99 && first.back >= 0.99 && second.back < 0.75) {
      return { kind: 'sure', item: first.item }
    }
    if (first.back - second.back >= 0.34) {
      return { kind: 'likely', item: first.item, others: scored.slice(1).map((s) => s.item) }
    }
    return { kind: 'which', items: close.slice(0, limit).map((s) => s.item) }
  }
  if (top.fit >= 0.99) return { kind: 'sure', item: top.item }
  return { kind: 'likely', item: top.item, others: scored.slice(1).map((s) => s.item) }
}
