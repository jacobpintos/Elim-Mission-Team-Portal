/**
 * Birthdays and anniversaries on the event calendar: set by admins, shown to
 * every account but a guest's or a public one (firestore.rules: occasions),
 * each year on its day — and what Miriam says of them: in the briefing, when
 * one is near, and asked ("whose birthday is next month?", "when is Josh and
 * Whitney's anniversary?").
 *
 * Kept together in one document (occasions/all), each by its id, as the
 * calendar notes are (stores/dateNotesStore): one listener, one offline copy.
 *
 * Pure, so it can be tested.
 */

export type OccasionKind = 'birthday' | 'anniversary'

export interface OccasionPerson {
  /** As they are called; their account's name is used instead where there is one. */
  name: string
  /** Their account, when they have one. */
  uid?: string
}

export interface Occasion {
  id: string
  kind: OccasionKind
  /** The one whose birthday it is; the couple whose anniversary. */
  people: OccasionPerson[]
  /** 1–12. */
  month: number
  /** 1–31. */
  day: number
}

/** On the calendar, and beside each on its day. */
export const OCCASION_ICON: Record<OccasionKind, string> = {
  birthday: '🎂',
  anniversary: '💍',
}

/** Who sees them: every account but a guest's or a public one (firestore.rules: seesOccasions). */
const SEES = ['admin', 'security', 'regular', 'intern', 'worship']
export const seesOccasions = (roles: readonly string[] | undefined) =>
  (roles ?? []).some((r) => SEES.includes(r))

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const at = (date: string) => new Date(`${date}T12:00:00Z`)
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
export const shiftDay = (date: string, n: number) => {
  const d = at(date)
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}

/** A field of the document, as an occasion — or null, if it isn't one. */
export function occasionFrom(id: string, v: unknown): Occasion | null {
  const o = v as Partial<Occasion> | null
  if (!o || (o.kind !== 'birthday' && o.kind !== 'anniversary')) return null
  const people = (Array.isArray(o.people) ? o.people : [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({ name: p.name.trim(), ...(p.uid ? { uid: String(p.uid) } : {}) }))
  const month = Number(o.month)
  const day = Number(o.day)
  if (!people.length || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null
  return { id, kind: o.kind, people, month, day }
}

/** Its day in `year` — the 28th of February for the 29th, in a year without one. */
export function occasionDate(o: Pick<Occasion, 'month' | 'day'>, year: number): string {
  return `${year}-${pad(o.month)}-${pad(Math.min(o.day, daysIn(year, o.month)))}`
}

/** Each one's day between two days (YYYY-MM-DD, both kept), soonest first. */
export function occasionsBetween(
  list: Occasion[],
  from: string,
  to: string
): { date: string; occasion: Occasion }[] {
  const found: { date: string; occasion: Occasion }[] = []
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const occasion of list) {
      const date = occasionDate(occasion, y)
      if (date >= from && date <= to) found.push({ date, occasion })
    }
  }
  return found.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.occasion.kind.localeCompare(b.occasion.kind) ||
      occasionTitle(a.occasion).localeCompare(occasionTitle(b.occasion))
  )
}

/** Its next day, today's included. */
export const nextDate = (o: Occasion, today: string) => {
  const year = Number(today.slice(0, 4))
  const date = occasionDate(o, year)
  return date >= today ? date : occasionDate(o, year + 1)
}

/** As they are called now: their account's name, where they have one. */
export type Names = ReadonlyMap<string, string>
const nameOf = (p: OccasionPerson, names?: Names) =>
  (p.uid && names?.get(String(p.uid))?.trim()) || p.name

/** "Whitney Slattery"; a couple, "Josh and Whitney Slattery", or "Sam Lee and Ann Park". */
export function whoSaid(o: Occasion, names?: Names): string {
  const all = o.people.map((p) => nameOf(p, names))
  if (all.length === 1) return all[0]
  const parts = all.map((n) => n.split(/\s+/))
  const lasts = parts.map((p) => (p.length > 1 ? p[p.length - 1] : ''))
  if (lasts[0] && lasts.every((l) => l.toLowerCase() === lasts[0].toLowerCase())) {
    const firsts = parts.map((p) => p.slice(0, -1).join(' '))
    return `${listed(firsts)} ${lasts[0]}`
  }
  return listed(all)
}

/** First names, for wishing them well: "Whitney", "Josh and Whitney". */
export function firstNames(o: Occasion, names?: Names): string {
  return listed(o.people.map((p) => nameOf(p, names).split(/\s+/)[0]))
}

/** "Whitney Slattery’s birthday", "Josh and Whitney Slattery’s anniversary". */
export function occasionTitle(o: Occasion, names?: Names): string {
  return `${whoSaid(o, names)}’s ${o.kind}`
}

const listed = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** "Monday, May 9" — or "today", "tomorrow" — as said of a day from `today`. */
export function daySaid(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === shiftDay(today, 1)) return 'tomorrow'
  const d = at(date)
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`
}

// --- In the briefing --------------------------------------------------------

/** How near one has to be for the briefing to say so. */
export const SOON_DAYS = 7

export interface OccasionNudge {
  /** The occasion's id and the day: unique on the briefing. */
  key: string
  date: string
  kind: OccasionKind
  title: string
  /** Said, and shown under it: "Wish Whitney a happy birthday", or theirs: "Happy birthday!". */
  wish: string
  /** Theirs: their own birthday, or anniversary. */
  own: boolean
}

/**
 * The birthdays and anniversaries within the week, to remind them to wish
 * those people well — their own said only on the day, to them.
 */
export function occasionsSoon(
  list: Occasion[],
  today: string,
  uid: string,
  names?: Names
): OccasionNudge[] {
  return occasionsBetween(list, today, shiftDay(today, SOON_DAYS - 1))
    .map(({ date, occasion }) => {
      const own = occasion.people.some((p) => p.uid && String(p.uid) === uid)
      return {
        key: `${occasion.id}_${date}`,
        date,
        kind: occasion.kind,
        title: occasionTitle(occasion, names),
        wish: own
          ? `Happy ${occasion.kind}!`
          : `Wish ${firstNames(occasion, names)} a happy ${occasion.kind}`,
        own,
      }
    })
    .filter((n) => !n.own || n.date === today)
}

/** As the briefing says one: "Whitney Slattery’s birthday is Thursday — wish Whitney a happy birthday!". */
export function nudgeSaid(n: OccasionNudge, today: string): string {
  if (n.own) return n.wish
  const when =
    n.date === today
      ? `Today is ${n.title}`
      : `${n.title} is ${daySaid(n.date, today).replace(/, .*$/, '')}`
  return `${when} — ${n.wish.charAt(0).toLowerCase()}${n.wish.slice(1)}!`
}

// --- Asked of Miriam ----------------------------------------------------------

/**
 * - `who`: one person's or a couple's — "when is Whitney's birthday?", "when
 *   is Josh and Whitney's anniversary?", "the Slatterys' anniversary".
 * - `span`: whose fall in a stretch of days — "whose birthday is next month?",
 *   "any anniversaries this week?", "who has a birthday coming up?", "the next
 *   birthday".
 */
export type OccasionAsk =
  | { kind: OccasionKind | 'any'; who: string }
  | { kind: OccasionKind | 'any'; span: Span }

/** Days, both kept; `next`: only the soonest. */
export interface Span {
  from: string
  to: string
  /** As said: "next month", "this week", "in December", "in the next 30 days". */
  label: string
  next?: boolean
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const KIND = /\b(birthdays?|b-?days?|bdays?|anniversar(?:y|ies))\b/g
const kindOf = (word: string): OccasionKind =>
  word.startsWith('anniversar') ? 'anniversary' : 'birthday'

/** Words for no one in particular, said first: then it is a stretch of days asked about. */
const NO_ONE =
  /^(?:the\s+(?:next|upcoming)|who|whose|who's|whos|anyone|anybody|someone|somebody|everyone|everybody|any|next|upcoming|there|it|this|that|is|are|do|does|did|has|have|will|was|were|how\s+many)\b/

/** "When is <who>'s birthday", "<who>'s anniversary", "when are the Slatterys celebrating their anniversary". */
const WHOSE =
  /^(?:(?:hey|so|ok|okay|um)\s+)*(?:miriam\s+)?(?:(?:when|what\s+day|what\s+date)(?:'s|s|\s+is|\s+are|\s+was)\s+|what(?:'s|s|\s+is)\s+the\s+date\s+of\s+|tell\s+me\s+|remind\s+me\s+(?:when|of)\s+)?(.+?)(?:'s|s'|')?\s+(?:birthdays?|b-?days?|bdays?|anniversar(?:y|ies))\b(?:\s+(?:is|again|coming\s+up))*$/

/**
 * A question about birthdays or anniversaries, or null for anything else.
 * `today`: YYYY-MM-DD, for the stretch of days asked about.
 */
export function occasionAsked(text: string, today: string): OccasionAsk | null {
  const s = plain(text)
  const kinds = [...s.matchAll(KIND)].map((m) => kindOf(m[1]))
  if (!kinds.length) return null
  const kind = new Set(kinds).size > 1 ? 'any' : kinds[0]
  // A note or a reminder about one is theirs to keep, and wishing one is not
  // asking: not a question for her here.
  if (
    /\b(?:remind\s+me\s+to|add\s+a\s+note|note\s+(?:that|for)|set\s+a\s+reminder)\b|\bhappy\s+(?:birthday|anniversary)\b/.test(
      s
    )
  )
    return null
  // An event's name: "when is Josh's birthday party?" is the party, an event.
  if (
    /\b(?:birthday|anniversary)\s+(?:party|parties|dinner|lunch|brunch|celebration|bash|service|event|cake|card|gift|present)\b/.test(
      s
    )
  )
    return null
  const named = WHOSE.exec(s)?.[1]?.trim()
  if (named && !NO_ONE.test(named) && !/\b(?:my|your|our)\b/.test(named)) {
    return { kind, who: named }
  }
  if (/\b(?:my|our)\s+(?:birthday|anniversary)\b/.test(s)) return null
  return { kind, span: spanIn(s, today) }
}

/** The stretch of days asked about; with none said, the next 30. */
function spanIn(s: string, today: string): Span {
  const [y, m] = today.split('-').map(Number)
  const monthSpan = (year: number, month: number, label: string): Span => ({
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(daysIn(year, month))}`,
    label,
  })
  if (/\btoday\b|\btonight\b/.test(s)) return { from: today, to: today, label: 'today' }
  if (/\btomorrow\b/.test(s)) {
    const t = shiftDay(today, 1)
    return { from: t, to: t, label: 'tomorrow' }
  }
  const dow = at(today).getUTCDay()
  if (/\bnext\s+week\b/.test(s)) {
    const from = shiftDay(today, 7 - dow)
    return { from, to: shiftDay(from, 6), label: 'next week' }
  }
  if (/\bthis\s+week\b|\bthe\s+week\b/.test(s)) {
    return { from: today, to: shiftDay(today, 6 - dow), label: 'this week' }
  }
  if (/\bnext\s+month\b/.test(s)) {
    return m === 12 ? monthSpan(y + 1, 1, 'next month') : monthSpan(y, m + 1, 'next month')
  }
  if (/\bthis\s+month\b/.test(s)) return { ...monthSpan(y, m, 'this month'), from: today }
  const named = MONTHS.findIndex((name) =>
    new RegExp(`\\b${name.toLowerCase()}\\b|\\b${name.slice(0, 3).toLowerCase()}\\b`).test(s)
  )
  if (named >= 0) {
    const month = named + 1
    return monthSpan(month < m ? y + 1 : y, month, `in ${MONTHS[named]}`)
  }
  if (/\b(?:the\s+)?next\b/.test(s) && !/\bnext\s+\d+\b/.test(s)) {
    return { from: today, to: shiftDay(today, 365), label: 'next', next: true }
  }
  return { from: today, to: shiftDay(today, 29), label: 'in the next 30 days' }
}

/** The words of a name, as matched: "slattery's" and "slatterys" are "slattery". */
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/'s\b|s'(?=\s|$)|'/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const NOT_A_NAME = new Set(['the', 'and', 'mr', 'mrs', 'ms', 'dr', 'pastor', 'family'])

/** Whether every word said names one of them — first names or last, in any order. */
function fits(o: Occasion, said: string, names?: Names): boolean {
  const asked = nameWords(said).filter((w) => !NOT_A_NAME.has(w))
  if (!asked.length) return false
  const theirs = o.people.flatMap((p) => nameWords(nameOf(p, names)))
  return asked.every((w) => theirs.some((t) => t === w || `${t}s` === w || `${t}es` === w))
}

export interface OccasionAnswer {
  text: string
  /** The one day it is about, for the calendar to open at. */
  date: string | null
}

/** What she says to what was asked, from the list they may see. */
export function occasionAnswer(
  ask: OccasionAsk,
  list: Occasion[],
  today: string,
  names?: Names
): OccasionAnswer {
  const ofKind = list.filter((o) => ask.kind === 'any' || o.kind === ask.kind)
  const what =
    ask.kind === 'any'
      ? 'birthdays or anniversaries'
      : ask.kind === 'birthday'
        ? 'birthdays'
        : 'anniversaries'
  if ('who' in ask) {
    const found = ofKind
      .filter((o) => fits(o, ask.who, names))
      .map((o) => ({ o, date: nextDate(o, today) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!found.length) {
      const kind = ask.kind === 'any' ? 'birthday or anniversary' : ask.kind
      // As asked: "Olivia", "Whitney and Josh", "the Smiths".
      const cap = (w: string) => (w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1))
      const family = /^the\s+/.test(ask.who)
      const words = ask.who
        .replace(/^the\s+/, '')
        .split(' ')
        .map(cap)
      const who = family ? `the ${words.join(' ').replace(/s?$/, 's')}` : words.join(' ')
      return {
        text: `I don’t have ${kind === 'anniversary' ? 'an' : 'a'} ${kind} for ${who}.`,
        date: null,
      }
    }
    const said = found.map(({ o, date }) =>
      date === today
        ? `Today is ${occasionTitle(o, names)}!`
        : `${occasionTitle(o, names)} is ${daySaid(date, today)}.`
    )
    return { text: said.join(' '), date: found.length === 1 ? found[0].date : null }
  }
  const { span } = ask
  let found = occasionsBetween(ofKind, span.from, span.to)
  if (span.next && found.length) found = found.filter((f) => f.date === found[0].date)
  if (!found.length) {
    return { text: `No ${what} ${span.next ? 'coming up' : span.label}.`, date: null }
  }
  const one = (f: { date: string; occasion: Occasion }) =>
    `${occasionTitle(f.occasion, names)}, ${daySaid(f.date, today)}`
  const days = new Set(found.map((f) => f.date))
  // One day asked about ("today"): the day said once, not with each.
  if (span.from === span.to) {
    const label = span.label.charAt(0).toUpperCase() + span.label.slice(1)
    return {
      text: `${label}: ${found.map((f) => occasionTitle(f.occasion, names)).join('; ')}.`,
      date: span.from,
    }
  }
  const lead = span.next
    ? `The next ${ask.kind === 'any' ? 'one' : ask.kind}: `
    : `Coming up ${span.label}: `
  return {
    text: `${lead}${found.map(one).join('; ')}.`,
    date: days.size === 1 ? found[0].date : null,
  }
}
