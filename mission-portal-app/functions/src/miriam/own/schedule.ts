import type { EventInstance, ScheduleLine } from '../data'

/**
 * Something on an event's schedule, asked by what it is — "When does Olivia
 * arrive?" for “Courtney and Olivia arrive”, "what time is the sermon?",
 * "what comes after the sermon?" — found by its words, however each is said
 * ("arrives", "arriving", "getting here"). Pure, so the app's quick answers
 * (src/lib/miriamQuick) find it on the device just as she does (./answers).
 */

/** Lowercase, with plain apostrophes, "&" as "and", and no punctuation. */
export const plainly = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[?!.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Asking words, not what is asked about: "when does the sermon start". */
const NOT_WHAT = new Set(
  'the a an and of to for on at in is are was does do did will would should can could we i you be it our my your this that what whats when time there comes happens happening next right event'.split(
    ' '
  )
)
/** Saying it happens, not what happens: "…start", "…begin". */
const HAPPENS = new Set([
  'start',
  'starts',
  'begin',
  'begins',
  'happen',
  'happens',
  'go',
  'take',
  'place',
  'scheduled',
])
/** Coming, said other ways: "getting here", "gets in", "shows up" — arriving. */
const ARRIVING = /\b(?:get|gets|getting|got)\s+(?:in|here|there)\b|\bshow(?:s|ing)?\s+up\b/g

/** Its words as compared: "olivia's" as "olivia". */
const wordsOf = (text: string) =>
  plainly(text).replace(/'s\b/g, '').replace(/'/g, '').split(' ').filter(Boolean)

/** A word as compared: "arrive", "arrives", "arriving", "arrival" all "arriv". */
const stem = (w: string) => w.replace(/(?:ing|ed|es|s|al)$/, '').replace(/e$/, '')
/** The same word, said any way — or one begun by the other: "check", "checkin". */
const sameWord = (a: string, b: string) => {
  const x = stem(a)
  const y = stem(b)
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 4 && long.startsWith(short)
}

/** What something is asked by, without the asking: "olivia arrive", "sermon". */
export function scheduleWhat(said: string): string[] {
  return wordsOf(plainly(said).replace(ARRIVING, 'arrive')).filter(
    (w) => w.length > 1 && !NOT_WHAT.has(w) && !HAPPENS.has(w)
  )
}

export interface ScheduleAsk {
  /** At what time it is, or what comes after or before it. */
  then: 'at' | 'after' | 'before'
  /** What it is, by its words: "olivia arrive", "sermon". */
  what: string[]
}

/**
 * Something on an event's schedule, asked by what it is — from the request
 * with the event's name read as "the event" (./events). Null for anything
 * else.
 */
export function scheduleAsked(masked: string): ScheduleAsk | null {
  const s = plainly(masked)
    // The event and the day it's on: not what is asked about.
    .replace(/\s+(?:on|at|for|in|during|of)\s+the\s+event\b.*$/, '')
    .replace(
      /\b(?:tonight|today|tomorrow|this\s+(?:morning|afternoon|evening)|on\s+\w+day)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
  // "what comes after the sermon?", "what's right before worship?"
  const order =
    /\bwhat(?:'s|s|\s+is|\s+comes|\s+happens|\s+is\s+happening|\s+do\s+we\s+do|\s+are\s+we\s+doing)?\s+(?:next\s+|right\s+|just\s+)?(after|before)\s+(.+)$/.exec(
      s
    )
  if (order) {
    const what = scheduleWhat(order[2])
    return what.length ? { then: order[1] as 'after' | 'before', what } : null
  }
  // "when does Olivia arrive?", "what time is the sermon?", "when's sound check?"
  const at =
    /^(?:so\s+|and\s+|ok\s+|okay\s+|hey\s+)?(?:when(?:'s|s)?|what\s+time(?:'s|s)?)\s+(?:(?:does|do|is|are|will|should|did|was)\s+)?(.+)$/.exec(
      s
    )
  if (at) {
    const what = scheduleWhat(at[1])
    return what.length ? { then: 'at', what } : null
  }
  return null
}

/**
 * Every word asked in what it says — two run together either way: "set up"
 * for “Setup”, "soundcheck" for “Sound check”.
 */
function saysAll(what: readonly string[], says: string): boolean {
  const words = wordsOf(says)
  const all = [...words, ...words.slice(1).map((w, i) => words[i] + w)]
  // Run together, a word must match whole: "olivia leave" is not “Olivia”.
  const whole = (w: string) => all.some((t) => stem(t) === stem(w))
  const has = (w: string) => whole(w) || words.some((t) => sameWord(w, t))
  for (let i = 0; i < what.length; i++) {
    if (i + 1 < what.length && whole(what[i] + what[i + 1])) i++
    else if (!has(what[i])) return false
  }
  return what.length > 0
}

/** Its items in order, and the ones that are what was asked: every word of it in the title or notes. */
export function scheduleItems(ev: EventInstance, what: readonly string[]) {
  const items = [...(ev.schedule ?? [])].sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
  const found = items.filter((it) => saysAll(what, `${it.title} ${it.notes ?? ''}`))
  return { items, found }
}

/** When it is, as shown in the app: "5:00 PM", "4:00–6:00 PM", "until 6:00 PM"; empty for none. */
export function timeOf(it: Pick<ScheduleLine, 'time' | 'endTime'>): string {
  if (!it.endTime) return it.time
  if (!it.time) return `until ${it.endTime}`
  const [start, half] = it.time.split(' ')
  if (half && half === it.endTime.split(' ')[1] && /^\d/.test(start))
    return `${start}–${it.endTime}`
  return `${it.time}–${it.endTime}`
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Which day it is on, for an event of more than one: "Saturday", "day 1"; null for one of one day. */
function dayOf(ev: EventInstance, it: ScheduleLine): string | null {
  const extra = ev.isRec ? [] : (ev.extraDays ?? [])
  if (!extra.length) return null
  const day = it.day ?? 0
  // A later day's instance doesn't carry the first day's date.
  const date = day === 0 ? (/_d\d+$/.test(ev.instanceKey) ? null : ev.date) : extra[day - 1]?.date
  return date ? DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] : `day ${day + 1}`
}

/** When it is, said after its name: " at 11:15 PM", " (4:00–6:00 PM)", " (Saturday, 9:00–11:00 AM)". */
function thenSaid(ev: EventInstance, it: ScheduleLine): string {
  const when = timeOf(it)
  const day = dayOf(ev, it)
  if (!day && !it.endTime) return when ? ` at ${when}` : ''
  const parts = [day, when].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/** When one is: "“Sermon” is at 11:15 PM", "“Sound check” is 4:00–6:00 PM", "“Hike” is on Saturday at 9:00 AM". */
function atSaid(ev: EventInstance, it: ScheduleLine): string {
  const when = timeOf(it)
  const day = dayOf(ev, it)
  const on = day ? ` on ${day}` : ''
  if (!when)
    return day ? `“${it.title}” is${on}, with no time set` : `“${it.title}” has no time set`
  return `“${it.title}” is${on}${it.endTime ? (day ? `, ${when}` : ` ${when}`) : ` at ${when}`}`
}

/**
 * The answer, from the event's own schedule — the time of what was asked,
 * or what comes after or before it — or null when it isn't on it.
 */
export function scheduleAnswer(ask: ScheduleAsk, ev: EventInstance): string | null {
  const { items, found } = scheduleItems(ev, ask.what)
  if (found.length === 0) return null
  const of = `the ${ev.title} schedule`
  if (ask.then === 'at') {
    return `On ${of}, ${found
      .slice(0, 3)
      .map((it) => atSaid(ev, it))
      .join('; ')}.`
  }
  const it = found[0]
  const at = items.indexOf(it)
  const other = items[ask.then === 'after' ? at + 1 : at - 1]
  if (!other)
    return `“${it.title}” is the ${ask.then === 'after' ? 'last' : 'first'} thing on ${of}.`
  const from = [dayOf(ev, it), timeOf(it)].filter(Boolean).join(', ')
  return `${ask.then === 'after' ? 'After' : 'Before'} “${it.title}”${from ? ` (${from})` : ''} comes “${other.title}”${thenSaid(ev, other)}, on ${of}.`
}
