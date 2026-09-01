/**
 * Building a Nashville token one key at a time.
 *
 * The chord boxes take tokens like "b7", "4maj7", "5m" or "4/1", which is a
 * lot of punctuation to hunt for on a phone keyboard — and the system
 * keyboard offers a thousand characters, seventeen of which are legal here.
 * The keypad exists so the only keys on screen are the ones that make a
 * chord, and this module holds the rules for what each key does, apart from
 * the drawing of it, so both can be checked.
 */

/** Longest sensible token; past this a key press is a mistake. */
export const MAX_TOKEN_LENGTH = 12

/**
 * Qualities offered on the second pane.
 *
 * The main pane covers what nearly every chord needs. These are real but
 * occasional, and putting them all on one pane would make the common keys
 * small enough to mis-hit.
 */
export const EXTENSION_KEYS = [
  'sus2',
  'sus4',
  'add9',
  '7',
  'maj7',
  'm7',
  '6',
  '9',
  '11',
  '13',
  'dim',
  'aug',
] as const

/**
 * Multi-character pieces, longest first.
 *
 * Backspace uses this to take back a whole "maj7" rather than leaving "maj",
 * which is not a thing and would render as nonsense.
 */
const UNITS = [...EXTENSION_KEYS].sort((a, b) => b.length - a.length)

/** How many recently used extensions stay pinned to the main pane. */
export const MAX_PINNED = 4

/**
 * Add a key press to a token.
 *
 * Deliberately permissive: NNS is written by people who know it, and the
 * combinations are open-ended enough that guarding against every odd one
 * would block legitimate chords. It refuses only what could never be
 * meaningful — a token that has run past any sensible length, and a second
 * progression dot, which marks an end and cannot mark two.
 */
export function appendChordKey(token: string, key: string): string {
  const current = token ?? ''
  if (current.length + key.length > MAX_TOKEN_LENGTH) return current

  // The dot ends a progression, so it belongs last and only once.
  if (key === '.') {
    if (current.endsWith('.') || current === '') return current
    return current + key
  }

  // Anything after the dot would sit outside the chord it marks the end of.
  if (current.endsWith('.')) return current

  return current + key
}

/**
 * Take back one piece of a token.
 *
 * A piece, not a character: "4maj7" backspaces to "4", because "4maj" is not
 * a chord anyone meant to be looking at on the way there.
 */
export function backspaceChordToken(token: string): string {
  const current = token ?? ''
  if (current === '') return ''

  for (const unit of UNITS) {
    if (current.endsWith(unit) && current.length > unit.length) {
      return current.slice(0, -unit.length)
    }
  }
  return current.slice(0, -1)
}

/**
 * Keep a used extension to hand.
 *
 * A song that wants one sus4 usually wants several, and going back to the
 * second pane each time is the thing that makes a keypad slower than the
 * keyboard it replaced. Most recent first, no duplicates, and it lives only
 * as long as the editor is open — a pinned key is a convenience, not a
 * setting to manage.
 */
export function pinExtension(pinned: string[], key: string, max = MAX_PINNED): string[] {
  return [key, ...pinned.filter((k) => k !== key)].slice(0, max)
}
