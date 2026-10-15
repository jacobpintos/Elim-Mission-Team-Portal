import { pickBest } from '../../functions/src/miriam/pick'

/**
 * What Miriam needs to work out, on the device, which of several things was
 * meant — a task, an item on a food sheet, a notification, a conversation —
 * and to read the answer to a question she asked back about it.
 *
 * The rule throughout: sure, and it is offered as it is; likely, and she asks
 * whether that is what was meant, naming it; several alike, and she asks which.
 */

/** Lowercase, plain apostrophes, no punctuation, single spaces. */
export function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[.?!,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Hey Miriam, could you please…": the asking taken off the front. */
export function withoutAsking(said: string): string {
  let s = said
  for (;;) {
    const next = s.replace(
      /^(?:hey|hi|ok|okay|so|um+|uh+|oh|well|alright|all\s+right|miriam|please|(?:can|could|would|will)\s+you(?:\s+please)?|i\s+need\s+you\s+to|i\s+want\s+you\s+to|i'?d\s+like\s+you\s+to|go\s+ahead\s+and|just)\s+/,
      ''
    )
    if (next === s) return s
    s = next
  }
}

/** Polite or filler endings: "…for me please", "…thanks". */
export function withoutEnding(said: string): string {
  let s = said
  for (;;) {
    const next = s.replace(
      /\s+(?:please|thanks|thank\s+you|for\s+me|now|already|just\s+now|real\s+quick|right\s+now)$/,
      ''
    )
    if (next === s) return s
    s = next
  }
}

const YES_WORDS =
  "yes|yeah|yea|yep|yup|ya|sure|ok|okay|do\\s+it|go\\s+ahead|confirm(?:ed)?|please\\s+do|that'?s\\s+(?:right|it|correct|the\\s+one|what\\s+i\\s+meant)|that\\s+one|correct|right|exactly|sounds\\s+good|uh\\s*huh|mm\\s*hmm|absolutely|definitely|of\\s+course|i\\s+do|it\\s+is|i\\s+did|perfect|great|yes\\s+i\\s+did"
const YES = new RegExp(`^(?:(?:${YES_WORDS})\\s+)+$`)
/** Said along with a yes without changing it: "yes please", "yeah thanks". */
const YES_FILLER =
  /\b(?:please|thanks|thank\s+you|so|oh|um+|uh+|well|actually|i\s+meant?|miriam)\b/g

/**
 * A plain yes, and nothing else: "yes", "yeah, that one", "correct, please".
 * Anything more ("yes, but the other one") is not taken for a yes, so what
 * else was said is not lost. "Please" on its own is a yes; "thanks" is not.
 */
export function saidYes(reply: string): boolean {
  // Not withoutAsking: its "please" is the start of "please do".
  const whole = plain(reply).replace(/^(?:(?:hey|hi)\s+)?miriam\s+/, '')
  const s = whole.replace(YES_FILLER, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return /^please$/.test(whole)
  return YES.test(`${whole} `) || YES.test(`${s} `)
}

const NO_START =
  /^(?:no|nope|nah|not\s+(?:that(?:\s+one)?|really|quite|exactly)|wrong(?:\s+one)?|that'?s\s+(?:not\s+it|wrong)|i\s+(?:meant|mean)|actually|rather|instead)\b\s*/

/**
 * A no, and whatever was said after it: "no, the youth one" — { rest: "the
 * youth one" }. Null when it isn't a no. "I meant…" and "actually…" are a no
 * to what was offered, with the right one after them.
 */
export function saidNo(reply: string): { rest: string } | null {
  let s = plain(withoutAsking(plain(reply)))
  if (!NO_START.test(s)) return null
  // "No, no — I meant the other one": every no taken off.
  while (NO_START.test(s)) s = s.replace(NO_START, '').trim()
  return { rest: s.replace(/^(?:it'?s|it\s+was|the\s+one\s+(?:is|was))\s+/, '').trim() }
}

/** Nothing more wanted: "never mind", "cancel", "forget it". */
export function saidNeverMind(reply: string): boolean {
  return /^(?:never\s*mind|nevermind|cancel|forget\s+(?:it|that|about\s+it)|stop|nothing|skip\s+it|leave\s+it|don'?t\s+bother|no\s+thanks?)\b/.test(
    plain(withoutAsking(plain(reply)))
  )
}

export { fitScore, pickBest, squash, type Picked } from '../../functions/src/miriam/pick'

const ORDINALS: [RegExp, (n: number) => number][] = [
  [/\b(?:first|1st|top)\b/, () => 0],
  [/\b(?:second|2nd|middle)\b/, (n) => (n >= 2 ? 1 : -1)],
  [/\b(?:third|3rd)\b/, (n) => (n >= 3 ? 2 : -1)],
  [/\b(?:fourth|4th)\b/, (n) => (n >= 4 ? 3 : -1)],
  [/\b(?:last|final|bottom|latter)\b/, (n) => n - 1],
  [/\bformer\b/, () => 0],
]
const NUMBERS: Record<string, number> = {
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
}

/** Words around a choice that are not part of it: "I meant the youth one". */
const CHOICE_FILLER =
  /\b(?:i|meant|mean|it'?s|it|was|is|the|one|that|this|please|yes|yeah|no|oh|um|uh|option|choice|number|thanks|actually|sorry)\b/g

/**
 * Which of the options she offered a reply picks: "the second one", "number
 * two", "the youth one", or its name. -1 when it isn't plainly one of them.
 */
export function choicePicked(reply: string, options: string[]): number {
  const s = plain(withoutAsking(plain(reply)))
  if (options.length === 0) return -1
  // One offered, and a yes to it: "that one", "yes".
  if (options.length === 1 && saidYes(reply)) return 0
  const lone = /^(?:number\s+|option\s+|the\s+)?(one|two|three|four|1|2|3|4)$/.exec(s)
  if (lone) {
    const i = NUMBERS[lone[1]]
    return i < options.length ? i : -1
  }
  const words = s.replace(CHOICE_FILLER, ' ').replace(/\s+/g, ' ').trim()
  const picked = words
    ? pickBest(
        options.map((label, i) => ({ label, i })),
        (o) => o.label,
        words
      )
    : ({ kind: 'none' } as const)
  // Its name first: "the first Sunday breakfast" is that option, not the first.
  if (picked.kind === 'sure') return picked.item.i
  for (const [re, at] of ORDINALS) {
    if (re.test(s)) {
      const i = at(options.length)
      if (i >= 0 && i < options.length) return i
    }
  }
  // Among the few offered, the likely one is plainly the one meant.
  return picked.kind === 'likely' ? picked.item.i : -1
}

/** "Pot roast, Drinks and Dessert"; `or` for a choice: "A, B or C". */
export function listed(items: string[], join: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${join} ${items[items.length - 1]}`
}

/** Quoted for saying back: “Sound check”. */
export const quoted = (s: string) => `“${s}”`

/**
 * A reply to her question that is plainly a request of its own — "what time
 * does it start?", "open my tasks" — rather than an answer she couldn't place.
 * Taken as a new request instead of being told she couldn't tell.
 */
export function looksLikeNewRequest(reply: string): boolean {
  const s = plain(withoutAsking(plain(reply)))
  return (
    /^(?:what|when|where|who|whose|why|how|is|are|was|were|can|could|will|would|should|do|does|did|open|show|play|turn|mark|remind|send|tell|read|check|go|take|find|start|stop|add|create|make|delete|cancel\s+my|set)\b/.test(
      s
    ) || s.split(' ').length >= 7
  )
}

/**
 * Whether what she said is on screen already, in so many words: "Okay." within
 * "Okay — nothing was changed." If not, it is written out as well (MiriamButton).
 */
export function shownAlready(said: string, shown: string | null): boolean {
  if (!shown) return false
  const words = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const s = words(said)
  return !!s && words(shown).includes(s)
}
