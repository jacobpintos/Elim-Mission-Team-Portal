/**
 * How well a name heard by speech recognition fits a name in the app —
 * "revival in the hard land" and "Revival In The Heartland".
 *
 * A recogniser writes what it heard as words it knows, so a name comes back
 * spelled however it sounds, split where it is one word ("heart land"), or
 * run together where it is two. So words are matched as they are written,
 * then as they sound, then nearly spelled the same, and one word is tried
 * against two run together, either way round. The same idea as the song
 * finder's (src/lib/songRequest), looser at the edges of a word.
 */

const SMALL = new Set(['the', 'of', 'and', 'for', 'in', 'at', 'on', 'a', 'an', 'to', 'my', 'is'])

/** The words that carry a name, lowercase. */
export function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SMALL.has(w))
}

/** A word as it sounds: vowels dropped after the first letter, alike consonants made one. */
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
    // Said quickly, these are the same sound: "hard land", "heartland".
    .replace(/d/g, 't')
    .replace(/b/g, 'p')
    .replace(/g/g, 'k')
    .replace(/v/g, 'f')
  if (!s) return ''
  const first = /[aeiou]/.test(s[0]) ? 'a' : s[0]
  return (first + s.slice(1).replace(/[aeiouyhw]/g, '')).replace(/(.)\1+/g, '$1')
}

/** Letters to change to turn one word into the other, up to 2. */
function closeness(a: string, b: string): number {
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
 * 1 for the same word or — `partial` — one it begins, 0.8 for one that
 * sounds or is spelled nearly the same.
 */
function wordFit(heard: string, wanted: string, partial = true): number {
  if (heard === wanted) return 1
  if (partial && (wanted.startsWith(heard) || heard.startsWith(wanted))) return 1
  if (/\d/.test(heard) || /\d/.test(wanted)) return 0
  if (Math.min(heard.length, wanted.length) >= 3 && soundOf(heard) === soundOf(wanted)) return 0.8
  if (Math.min(heard.length, wanted.length) >= 5 && closeness(heard, wanted) <= 1) return 0.8
  if (Math.min(heard.length, wanted.length) >= 8 && closeness(heard, wanted) <= 2) return 0.8
  return 0
}

/**
 * How well what was said fits a name, 0 to 1: the share of the words said
 * that are found in it, as written, by sound, or two run together.
 */
export function nameScore(name: string, said: string): number {
  const heard = nameWords(said)
  const wanted = nameWords(name)
  if (heard.length === 0 || wanted.length === 0) return 0
  // Two words run together, on either side: "heart land" ~ "heartland".
  const joinedWanted = wanted.slice(1).map((w, i) => wanted[i] + w)
  const fits = heard.map((h, i) => {
    let best = Math.max(0, ...wanted.map((w) => wordFit(h, w)))
    // Run together, a word must match whole: "harvestparty" is not "harvest".
    if (best < 1) best = Math.max(best, ...joinedWanted.map((w) => wordFit(h, w, false)))
    const next = heard[i + 1]
    if (best < 1 && next) best = Math.max(best, ...wanted.map((w) => wordFit(h + next, w, false)))
    const prev = heard[i - 1]
    if (best < 1 && prev) best = Math.max(best, ...wanted.map((w) => wordFit(prev + h, w, false)))
    return best
  })
  return fits.reduce((a, b) => a + b, 0) / heard.length
}
