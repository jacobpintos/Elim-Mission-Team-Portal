import { eventRef } from './miriamQuick'
import { plain, saidNeverMind, saidNo, saidYes, withoutAsking } from './miriamReplies'

/**
 * Availability, as it is said to Miriam — "I can't make it Friday", "I'll be
 * late to youth night", "not sure about the retreat yet" — and as her
 * questions about it are answered ("Can you make Sunday Service?" — "Yes,
 * but I'll be a little late"). Worked out on the device (features/miriam/localTalk).
 */

export type AvailStatus = 'yes' | 'no' | 'partial' | 'tbd'

export interface AvailabilitySaid {
  status: AvailStatus
  /** Kept with the answer, for whoever plans it: "Arriving late — work", "I'm out of town". */
  note: string
  /** The event, as far as it was said: a day and the words naming it. Both empty: not said. */
  date: string | null
  name: string
}

const TBD =
  /\b(?:not\s+sure|unsure|maybe|possibly|perhaps|tbd|might\s+(?:make\s+it|come|be(?:\s+there)?|go)|(?:i\s+)?don'?t\s+know(?:\s+yet)?|do\s+not\s+know|won'?t\s+know|let\s+you\s+know|ask\s+me\s+(?:later|again|tomorrow)|depends|undecided|on\s+the\s+fence)\b/
const LATE =
  /\b(?:(?:be|arrive|arriving|get(?:ting)?\s+there|come|coming|running|show(?:ing)?\s+up)\s+(?:a\s+(?:bit|little)\s+)?late|late\s+(?:arrival|start))\b/
const EARLY = /\b(?:leav(?:e|ing)|head(?:ing)?\s+out|duck(?:ing)?\s+out|go(?:ing)?)\s+early\b/
const PART =
  /\b(?:part(?:ly|ially)?\s+(?:available|there)|(?:for\s+)?(?:part|some)\s+of\s+(?:it|the)|only\s+(?:for|stay|be\s+there|come|make)|just\s+for\s+(?:the|a)|half\s+(?:of\s+)?(?:it|the)|miss\s+(?:the\s+)?(?:start|beginning|first|end|last)|the\s+(?:first|second)\s+half)\b/
const NO =
  /\b(?:not\s+available|unavailable|can(?:'t|not)\s+(?:make\s+it|make|come|be\s+(?:there|at|in)|go|attend)|won'?t\s+(?:be\s+(?:there|able|available|at|in|going)|make\s+it|make|come|go)|count\s+me\s+out|not\s+(?:coming|going|gonna\s+make\s+it|going\s+to\s+make\s+it|able\s+to)|(?:have|got)\s+to\s+(?:miss|skip)|(?:i'?ll|i\s+will)\s+(?:miss|be\s+away|be\s+out\s+of\s+town)|i\s+can'?t)\b/
const YES =
  /\b(?:available|can\s+(?:make\s+it|make|come|be\s+there|go|attend)|will\s+be\s+there|i'?ll\s+be\s+there|count\s+me\s+in|i'?m\s+(?:in|coming|going)|i\s+am\s+(?:in|coming|going)|i'?ll\s+come|i'?ll\s+make\s+it|be\s+there)\b/

/** Why, if they said: "because I'm out of town" — "I'm out of town". */
const REASON = /\b(?:because|since|'cause|cause|cuz|as\s+i(?:'m|\s+am|'ll|\s+will))\b\s*(.+)$/

/** Words of the answer, not of the event's name. */
const ANSWER_WORDS = new Set(
  (
    "i i'm im i'll ill am will be can can't cant cannot not won't wont make it come coming going " +
    'there available unavailable count me in out put down as mark sure maybe possibly perhaps tbd ' +
    "might don't dont know yet let you ask later again depends attend go to for the of a an and but " +
    'late early leave leaving arrive arriving get getting part partly partially some only just half ' +
    'miss start beginning first second end last have got skip able bit little running show showing up ' +
    'stay away town out also yes yeah no nope though so sorry unfortunately probably definitely ' +
    'about at on this that whether if'
  ).split(' ')
)

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** The answer and the note to go with it, from what was said: null when it isn't one. */
function statusOf(s: string): { status: AvailStatus; note: string } | null {
  const why = (REASON.exec(s)?.[1] ?? '').trim()
  // "because of work" kept as "Because of work"; "because I'm away" as "I'm away".
  const reason = /^of\s/.test(why) ? `Because ${why}` : cap(why)
  const withReason = (note: string) => [note, reason].filter(Boolean).join(' — ')
  if (TBD.test(s)) return { status: 'tbd', note: reason }
  if (LATE.test(s)) return { status: 'partial', note: withReason('Arriving late') }
  if (EARLY.test(s)) return { status: 'partial', note: withReason('Leaving early') }
  if (PART.test(s)) return { status: 'partial', note: withReason('Part of it') }
  if (NO.test(s)) return { status: 'no', note: reason }
  if (YES.test(s)) return { status: 'yes', note: reason }
  return null
}

/**
 * An availability given in so many words — "I can't make it Friday", "count
 * me in for the retreat", "I'll be late to youth night because of work",
 * "not sure about Sunday yet". Null when it isn't one: a question ("can I
 * make it?") or anything not about them coming.
 */
export function availabilitySaid(text: string, today: string): AvailabilitySaid | null {
  if (text.includes('?')) return null
  const s = plain(withoutAsking(plain(text)))
  if (/^(?:am|is|are|was|who|what|when|which|where|how|can\s+i|will\s+i|do\s+i)\b/.test(s))
    return null
  // About them: "I…", "put me down…", "count me…", "not sure about…", "maybe…".
  if (
    !/^(?:i\b|i'm|im\b|i'll|ill\b|put\s+me|mark\s+me|count\s+me|not\s+sure|maybe|unfortunately|sorry)/.test(
      s
    )
  )
    return null
  const got = statusOf(s)
  if (!got) return null
  // What is left of it names the event: the reason taken off first.
  const about = s.replace(REASON, ' ').replace(/\s+/g, ' ').trim()
  const ref = eventRef(about, today, ANSWER_WORDS)
  return { ...got, date: ref?.date ?? null, name: ref?.name ?? '' }
}

/** A reply to "Can you make …?": an answer, a pass on this one, or an end to the questions. */
export type AvailabilityReply =
  | { kind: 'answer'; status: AvailStatus; note: string }
  | { kind: 'skip' }
  | { kind: 'stop' }

/**
 * Her question about one event — "Can you make Youth Night on Friday?" —
 * answered: "yes", "no, I'm out of town", "I'll be late", "I don't know yet"
 * (to be asked again), "skip" (left for another time), "stop" (no more
 * questions). Null when it isn't plainly any of those.
 */
export function availabilityReply(reply: string): AvailabilityReply | null {
  const s = plain(withoutAsking(plain(reply)))
  if (!s) return null
  if (/^(?:skip|next|pass)(?:\s+(?:it|that|this|one|that\s+one|this\s+one))?$/.test(s))
    return { kind: 'skip' }
  // Not sure yet comes before no: "I don't know" is not a no.
  if (TBD.test(s)) return { kind: 'answer', status: 'tbd', note: '' }
  if (
    saidNeverMind(reply) ||
    /^(?:not\s+now|that'?s\s+(?:all|it|enough)|no\s+more|enough|done|i'?m\s+done)\b/.test(s)
  )
    return { kind: 'stop' }
  const no = saidNo(reply)
  const said = statusOf(s)
  // "Yes, but I'll be late": the late is what counts.
  if (said?.status === 'partial') return { kind: 'answer', ...said }
  if (no) {
    // "No, I'm out of town": the rest, kept as why — unless it is a yes after all ("no, I can make it").
    const rest = statusOf(no.rest)
    if (rest && rest.status !== 'no') return { kind: 'answer', ...rest }
    const why = cap(
      no.rest.replace(/^(?:i\s+can'?t|can'?t|sorry|unfortunately)\b[\s,]*/, '').trim()
    )
    return { kind: 'answer', status: 'no', note: rest?.note || why }
  }
  if (said) return { kind: 'answer', ...said }
  if (saidYes(reply) || /^(?:yes|yep|yeah|sure|definitely|absolutely|of\s+course)\b/.test(s))
    return { kind: 'answer', status: 'yes', note: '' }
  return null
}
