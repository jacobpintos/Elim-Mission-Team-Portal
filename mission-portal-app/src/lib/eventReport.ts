import {
  assignedTo,
  effectiveResponse,
  shiftDate,
  type AvailResponse,
  type AvailStatus,
  type EventInstance,
  type Group,
} from '../../functions/src/miriam/data'
import { formatCents, type OutstandingSummary } from '../../functions/src/reimbursements/logic'
import { eventRef } from './miriamQuick'

/**
 * An event's report, for an admin — "give me a report on Revival": whether
 * it is behind or on track, its tasks, who can come (and what changed since
 * they last asked), the reimbursement requests still open, and the weather.
 * Gathered on the device (features/miriam/eventReportData), shown in Miriam's
 * panel and said aloud.
 *
 * Pure, for tests: what it needs is handed in.
 */

// --- Asked for --------------------------------------------------------------

export interface ReportAsk {
  /** The day said, if one was. */
  date: string | null
  /** The words naming it: none for "the next event", "service" for "the next service". */
  name: string
  /**
   * Not plainly a report asked for: named before the word "report" ("the
   * Revival report" — "the security report" is no event's), or asked as a
   * question ("how is Revival looking?"). Taken only if an event is found
   * by it, and for anyone but an admin left to her other answers.
   */
  loose: boolean
}

const ASK = String.raw`(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:give|get|show|send|bring|read|run|pull)\s+(?:me\s+)?(?:up\s+)?|(?:i\s+(?:want|need)|i'd\s+like)\s+(?:to\s+(?:see|hear|get)\s+)?|(?:can|could|may)\s+i\s+(?:get|have|see|hear)\s+|let\s+me\s+(?:see|have|hear)\s+|let's\s+(?:see|hear|have)\s+|what(?:'s|\s+is)\s+)?`
/** What kind of report: "a quick status report". */
const KIND = String.raw`(?:(?:quick|full|status|event|progress)\s+)*`
const END = String.raw`(?:\s+please)?$`

const ASKED: RegExp[] = [
  // "give me a report on Revival", "the status report for the retreat"
  new RegExp(
    String.raw`^${ASK}(?:a|an|the|my|me\s+an?)\s+${KIND}report\s+(?:on|for|about|of)\s+(.+?)${END}`
  ),
  // "status report on Revival", "event report for Sunday"
  new RegExp(
    String.raw`^${ASK}(?:status|event|progress)\s+report\s+(?:on|for|about|of)\s+(.+?)${END}`
  ),
  // "report on Revival"
  new RegExp(String.raw`^${ASK}report\s+(?:on|about)\s+(.+?)${END}`),
]
// Asked as a question, about an event ("how is Revival looking?"): loose.
const ASKED_LOOSELY: RegExp[] = [
  // "what's the status of Revival", "status on the retreat"
  new RegExp(String.raw`^${ASK}(?:the\s+)?(?:status|state)\s+(?:of|on|for)\s+(.+?)${END}`),
  // "give me an update on Revival", "a quick rundown of Sunday"
  new RegExp(
    String.raw`^${ASK}(?:an?\s+|the\s+|my\s+)?(?:quick\s+)?(?:update|rundown|run-down|overview|summary)\s+(?:on|of|for|about)\s+(.+?)${END}`
  ),
  // "how is Revival looking", "how's Sunday service coming along"
  /^how(?:'s|\s+is|\s+are)\s+(.+?)\s+(?:looking|going|coming\s+along|coming|shaping\s+up)(?:\s+so\s+far)?$/,
  // "how are things looking for Revival"
  /^how(?:'s|\s+is|\s+are)\s+(?:it|things|we)\s+(?:looking|going|doing)\s+(?:for|with|on)\s+(.+)$/,
  // "is Revival on track", "is the retreat behind"
  /^(?:is|are)\s+(.+?)\s+(?:on\s+track|behind(?:\s+schedule)?|ready)$/,
  // "are we on track for Revival", "are we ready for Sunday"
  /^(?:are\s+we|is\s+everything|is\s+everyone)\s+(?:on\s+track|behind(?:\s+schedule)?|ready)\s+(?:for|with|on)\s+(.+)$/,
  // "where are we with Revival", "where do we stand on the retreat"
  /^where\s+(?:are\s+we|do\s+we\s+stand|are\s+things|do\s+things\s+stand)(?:\s+at)?\s+(?:with|on)\s+(.+)$/,
  // "catch me up on Revival"
  /^catch\s+me\s+up\s+on\s+(.+)$/,
]
/** Asked that way, but of the weather, a person, or how she is: not an event's report. */
const NOT_ASKED_OF_AN_EVENT =
  /\b(?:weather|forecast|rain|raining|snow|storm|temperature|you|yourself|i|me)\b/
// "give me a status report", "the event report": none named — the next event's.
const BARE = new RegExp(
  String.raw`^${ASK}(?:(?:a|an|the|my|me\s+an?)\s+${KIND}|(?:status|event|progress)\s+)report${END}`
)
// "the Revival report", "give me the retreat status report"
const NAME_FIRST = new RegExp(
  String.raw`^${ASK}(?:an?\s+|the\s+|my\s+)?(.+?)\s+${KIND}report${END}`
)
/** Reports that aren't an event's: never read as an event's name. */
const NOT_AN_EVENT =
  /^(?:daily|morning|monthly|weekly|security|incident|issues?|kaizen|expenses?|reimbursements?|finance|financial|budget|bug|problem|weather|status|progress|event|quick|full)$/

/**
 * "The next event", "our upcoming one", "the next service": the nearest to
 * come — the next Sunday service, said as a service.
 */
const NEXT =
  /^(?:(?:the|my|our|this)\s+)?(?:very\s+)?(?:next|upcoming|coming|soonest)(?:\s+(?:event|one|thing|gathering|trip|meeting)s?|\s+(service|church(?:\s+service)?|worship(?:\s+service)?)s?)?$/

/**
 * "Give me a report on Revival", "status report for Sunday", "the retreat
 * report", "a report on the next event", "how is Revival looking?": the
 * event asked about.
 */
export function reportAsked(text: string, today: string): ReportAsk | null {
  const said = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|ok|okay)\s+)?(?:miriam\s+)?/, '')
    // "this Sunday's service", "tonight's event": the day, as said.
    .replace(/\b(today|tonight|tomorrow|(?:sun|mon|tues|wednes|thurs|fri|satur)day)'s\b/g, '$1')
  for (const re of ASKED) {
    const m = re.exec(said)
    if (m) return named(m[1], today, false)
  }
  if (BARE.test(said)) return { date: null, name: '', loose: false }
  const m = NAME_FIRST.exec(said)
  if (m && !NOT_AN_EVENT.test(m[1].trim())) return named(m[1], today, true)
  for (const re of ASKED_LOOSELY) {
    const m = re.exec(said)
    if (m && !NOT_ASKED_OF_AN_EVENT.test(m[1])) return named(m[1], today, true)
  }
  return null
}

/**
 * The event a report is asked of, from the events `find` gives for a day
 * ('' for any): on the day said; else the one that best fits its name, the
 * next to come of those that fit as well; and with no name ("the next
 * event"), the next to come. Null when none fits.
 *
 * `find` is functions/src/miriam/data findEvents, which gives them in that
 * order — best fit first, then upcoming before past, nearest first — so its
 * first is the one: "the fall retreat" is the Fall Retreat, past or not,
 * before a Youth Retreat still to come.
 */
export function eventAsked<E>(ask: ReportAsk, find: (date: string) => E[]): E | null {
  if (ask.date) {
    const onTheDay = find(ask.date)
    if (onTheDay.length) return onTheDay[0]
    // A day with no event (by that name) on it: "Sunday Service" asked late
    // on a Sunday is still the service, by its name — but a day alone is none.
    if (!ask.name) return null
  }
  return find('')[0] ?? null
}

function named(words: string, today: string, loose: boolean): ReportAsk | null {
  const next = NEXT.exec(words.trim())
  if (next) return { date: null, name: next[1] ? 'service' : '', loose }
  const ref = eventRef(words.replace(/'/g, '’'), today)
  return ref ? { ...ref, loose } : null
}

// --- The report ---------------------------------------------------------------

/** A task as the report reads it (src/types/events Task). */
export interface ReportTask {
  id: string | number
  title: string
  status: string
  dueDate?: string | null
  projectedDate?: string | null
  assignees: (string | number)[]
  evId?: string | number | null
  evTemplateId?: string | number | null
  evDate?: string | null
}

/** Someone's answer, or none. */
export type AnswerState = AvailStatus | 'none'

/** The answers as they were when an admin last had this event's report: kept for the next. */
export interface ReportSeen {
  at: number
  answers: Record<string, AnswerState>
}

export interface ReportWeather {
  forecast: { high: number; low: number; precipPct: number; label: string } | null
  /** Weather alerts covering its day: their names ("Severe Thunderstorm Watch"). */
  alerts: string[]
}

export interface EventReportInput {
  ev: EventInstance
  /** Every task the admin can see; the event's are picked out (tasksOfEvent). */
  tasks: ReportTask[]
  groups: Group[]
  /** Its date's availability, and its series' (a repeating event's). */
  instance: Record<string, AvailResponse>
  series: Record<string, AvailResponse>
  names: Map<string, string>
  /** As they were when this admin last had its report; null the first time. */
  seen: ReportSeen | null
  /** Its requests still open (functions: eventReimbursements); null when they couldn't be read. `amounts`: theirs to see — the Accountant's. */
  reimbursements: (OutstandingSummary & { amounts: boolean }) | null
  /** Null when the forecast couldn't be fetched. */
  weather: ReportWeather | null
  today: string
  now: number
}

export type ReportStatus = 'behind' | 'on-track' | 'no-tasks'

export interface AnswerChange {
  uid: string
  name: string
  was: AnswerState
  now: AnswerState
}

export interface EventReport {
  key: string
  title: string
  date: string
  status: ReportStatus
  tasks: {
    total: number
    done: number
    behind: ReportTask[]
    overdue: ReportTask[]
    dueSoon: ReportTask[]
  }
  availability: {
    onIt: number
    counts: Record<AnswerState, number>
    /** Null the first time they have its report: nothing to compare with. */
    changes: AnswerChange[] | null
    since: number | null
  }
  /** Shown in Miriam's panel. */
  text: string
  /** Said aloud. */
  spoken: string
  /** To keep, for what changed next time. */
  seen: ReportSeen
}

/** Due within this many days: "due soon". */
export const DUE_SOON_DAYS = 7
/** Named, at most, in each list; the rest counted. */
const MAX_NAMED = 5
const MAX_SPOKEN = 3

const sameId = (a: unknown, b: unknown) => a != null && String(a) === String(b)

/**
 * The event's tasks: made for it (by its id); for a repeating event, those
 * for this date, or for no date in particular.
 */
export function tasksOfEvent(tasks: ReportTask[], ev: EventInstance): ReportTask[] {
  return tasks.filter(
    (t) =>
      sameId(t.evId ?? t.evTemplateId, ev.templateId) &&
      (!ev.isRec || !t.evDate || t.evDate === ev.date)
  )
}

/** Past its due date and not done, as the app's own isOverdue reads it. */
const isOverdue = (t: ReportTask, today: string) =>
  t.status !== 'done' && !!t.dueDate && t.dueDate < today

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listed = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const shortDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const longDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
const headDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
const localDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ANSWER_SAID: Record<AnswerState, string> = {
  yes: 'available',
  no: 'not available',
  partial: 'partly available',
  tbd: 'not sure',
  none: 'no answer',
}

/** "Sam Lee", or "Sam Lee and 2 more", or "no one yet". */
function whose(t: ReportTask, names: Map<string, string>): string {
  const all = t.assignees.map((a) => names.get(String(a)) || 'Someone')
  if (!all.length) return 'no one yet'
  return all.length === 1 ? all[0] : `${all[0]} and ${all.length - 1} more`
}

/** Written lines for a list of tasks, at most MAX_NAMED, the rest counted. */
function taskLines(
  label: string,
  tasks: ReportTask[],
  names: Map<string, string>,
  when: (t: ReportTask) => string
): string[] {
  if (!tasks.length) return []
  const shown = tasks
    .slice(0, MAX_NAMED)
    .map((t) => `${t.title} (${[whose(t, names), when(t)].filter(Boolean).join(', ')})`)
  const more = tasks.length > MAX_NAMED ? `; and ${tasks.length - MAX_NAMED} more` : ''
  return [`• ${label}: ${shown.join('; ')}${more}`]
}

/** When they last had it, as said: "earlier today", "yesterday", "on Tuesday", "on Nov 3". */
export function sinceSaid(at: number, today: string): string {
  const day = localDate(at)
  if (day === today) return 'earlier today'
  if (day === shiftDate(today, -1)) return 'yesterday'
  if (day > shiftDate(today, -7)) {
    return `on ${new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}`
  }
  return `on ${shortDay(day)}`
}

/** One change, as written and as said. */
function changeSaid(c: AnswerChange): { written: string; spoken: string } {
  if (c.was === 'none') {
    return {
      written: `${c.name} answered: ${ANSWER_SAID[c.now]}`,
      spoken: `${c.name} answered ${ANSWER_SAID[c.now]}`,
    }
  }
  if (c.now === 'none') {
    return {
      written: `${c.name} took back their answer`,
      spoken: `${c.name} took back their answer`,
    }
  }
  return {
    written: `${c.name}: ${ANSWER_SAID[c.was]} → ${ANSWER_SAID[c.now]}`,
    spoken: `${c.name} changed from ${ANSWER_SAID[c.was]} to ${ANSWER_SAID[c.now]}`,
  }
}

function weatherSaid(ev: EventInstance, w: ReportWeather | null, today: string): string {
  if (ev.isVirtual) return 'It’s virtual: no weather to give.'
  if (typeof ev._geocodeLat !== 'number' || typeof ev._geocodeLng !== 'number') {
    return 'No place is set for it, so there’s no forecast.'
  }
  if (!w) return 'I couldn’t get the forecast just now.'
  const alerts = w.alerts.length ? ` Weather alert: ${listed(w.alerts)}.` : ''
  if (!w.forecast) {
    const none = ev.date < today ? 'It’s already past.' : 'It’s too far off for a forecast yet.'
    return none + alerts
  }
  const f = w.forecast
  const rain = f.precipPct >= 20 ? `, ${f.precipPct}% chance of rain` : ''
  return `${capital(f.label.toLowerCase())}, high ${Math.round(f.high)}°, low ${Math.round(f.low)}°${rain}.${alerts}`
}

function reimbursementsSaid(r: EventReportInput['reimbursements']): string {
  if (!r) return 'I couldn’t check reimbursements just now.'
  if (!r.toDecide && !r.toPay) return 'None outstanding.'
  const parts: string[] = []
  if (r.toDecide) {
    parts.push(
      `${plural(r.toDecide, 'request')} waiting for a decision${r.amounts ? ` (${formatCents(r.toDecideCents)})` : ''}`
    )
  }
  if (r.toPay) {
    const late = r.overdue
      ? `, ${r.overdue} past ${r.overdue === 1 ? 'its' : 'their'} pay-by date`
      : ''
    parts.push(
      `${plural(r.toPay, 'approved request')} waiting to be paid${r.amounts ? ` (${formatCents(r.toPayCents)})` : ''}${late}`
    )
  }
  return `${capital(listed(parts))}.`
}

export function buildEventReport(input: EventReportInput): EventReport {
  const { ev, names, today, now } = input
  const soon = shiftDate(today, DUE_SOON_DAYS)

  // Tasks: behind is how they said it was going; overdue, past due and not
  // done; due soon, the week ahead. As the app's own On Track / Behind.
  const mine = tasksOfEvent(input.tasks, ev)
  const open = mine.filter((t) => t.status !== 'done')
  const byDue = (a: ReportTask, b: ReportTask) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  const behind = open.filter((t) => t.status === 'behind').sort(byDue)
  const overdue = open.filter((t) => t.status !== 'behind' && isOverdue(t, today)).sort(byDue)
  const dueSoon = open
    .filter((t) => t.status !== 'behind' && t.dueDate && t.dueDate >= today && t.dueDate <= soon)
    .sort(byDue)
  const status: ReportStatus = !mine.length
    ? 'no-tasks'
    : behind.length || overdue.length
      ? 'behind'
      : 'on-track'

  // Availability: everyone on it, and what changed since this admin last had it.
  const onIt = [...assignedTo(ev, input.groups)].sort()
  const answers: Record<string, AnswerState> = {}
  const counts: Record<AnswerState, number> = { yes: 0, no: 0, partial: 0, tbd: 0, none: 0 }
  for (const uid of onIt) {
    const state = effectiveResponse(ev, uid, input.instance, input.series)?.status ?? 'none'
    answers[uid] = state
    counts[state]++
  }
  const changes = input.seen
    ? onIt
        .filter((uid) => (input.seen?.answers[uid] ?? 'none') !== answers[uid])
        .map((uid) => ({
          uid,
          name: names.get(uid) || 'Someone',
          was: input.seen?.answers[uid] ?? 'none',
          now: answers[uid],
        }))
    : null

  // --- Written ---
  const statusLabel =
    status === 'behind' ? '⚠ Behind' : status === 'on-track' ? '✓ On Track' : 'No tasks'
  const countsSaid = (
    [
      ['yes', 'available'],
      ['no', 'not available'],
      ['partial', 'partly'],
      ['tbd', 'not sure'],
      ['none', 'no answer'],
    ] as [AnswerState, string][]
  )
    .filter(([k]) => counts[k])
    .map(([k, label]) => `${counts[k]} ${label}`)
  const since = input.seen ? sinceSaid(input.seen.at, today) : ''
  const changeLines = !changes
    ? ['• First report on it: next time, what changed since is shown here.']
    : changes.length
      ? [
          `• Since you last checked (${since}): ${changes
            .slice(0, MAX_NAMED)
            .map((c) => changeSaid(c).written)
            .join(
              '; '
            )}${changes.length > MAX_NAMED ? `; and ${changes.length - MAX_NAMED} more` : ''}`,
        ]
      : [`• No changes since you last checked (${since}).`]
  const text = [
    `${ev.title} — ${headDay(ev.date)}`,
    `Status: ${statusLabel}`,
    '',
    mine.length
      ? `Tasks: ${mine.length} — ${mine.length - open.length} done, ${open.length} open`
      : 'Tasks: none on it',
    ...taskLines('Behind', behind, names, (t) =>
      t.projectedDate
        ? `projected ${shortDay(t.projectedDate)}`
        : t.dueDate
          ? `due ${shortDay(t.dueDate)}`
          : ''
    ),
    ...taskLines('Overdue', overdue, names, (t) => (t.dueDate ? `due ${shortDay(t.dueDate)}` : '')),
    ...taskLines(`Due in the next ${DUE_SOON_DAYS} days`, dueSoon, names, (t) =>
      t.dueDate ? `due ${shortDay(t.dueDate)}` : ''
    ),
    '',
    onIt.length
      ? `Availability (${plural(onIt.length, 'person', 'people')} on it): ${countsSaid.join(' · ')}`
      : 'Availability: no one is on it yet',
    ...(onIt.length ? changeLines : []),
    '',
    `Reimbursements: ${reimbursementsSaid(input.reimbursements)}`,
    '',
    `Weather: ${weatherSaid(ev, input.weather, today)}`,
  ].join('\n')

  // --- Said ---
  const said: string[] = [`Here’s your report on ${ev.title}, ${longDay(ev.date)}.`]
  if (status === 'no-tasks') said.push('It has no tasks.')
  else if (status === 'on-track') {
    said.push(
      `It’s on track: ${mine.length - open.length} of ${plural(mine.length, 'task')} done${
        dueSoon.length ? `, and ${dueSoon.length} due in the next week` : ''
      }.`
    )
  } else {
    const problems = [
      behind.length
        ? `${plural(behind.length, 'task')} ${behind.length === 1 ? 'is' : 'are'} behind`
        : '',
      overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue` : '',
    ].filter(Boolean)
    const named = [...behind, ...overdue].slice(0, MAX_SPOKEN).map((t) => t.title)
    const more = behind.length + overdue.length > MAX_SPOKEN ? ', and more' : ''
    said.push(
      `It’s behind: ${listed(problems)} — ${listed(named)}${more}.${
        dueSoon.length
          ? ` ${dueSoon.length} more ${dueSoon.length === 1 ? 'is' : 'are'} due in the next week.`
          : ''
      }`
    )
  }
  if (onIt.length) {
    const parts = [
      counts.yes ? `${counts.yes} ${counts.yes === 1 ? 'is' : 'are'} available` : '',
      counts.no ? `${counts.no} ${counts.no === 1 ? 'isn’t' : 'aren’t'}` : '',
      counts.partial ? `${counts.partial} partly` : '',
      counts.tbd ? `${counts.tbd} ${counts.tbd === 1 ? 'isn’t' : 'aren’t'} sure yet` : '',
      counts.none ? `${counts.none} ${counts.none === 1 ? 'hasn’t' : 'haven’t'} answered` : '',
    ].filter(Boolean)
    said.push(`Of ${plural(onIt.length, 'person', 'people')} on it, ${listed(parts)}.`)
    if (changes?.length) {
      const named = changes.slice(0, MAX_SPOKEN).map((c) => changeSaid(c).spoken)
      const more =
        changes.length > MAX_SPOKEN ? `; and ${changes.length - MAX_SPOKEN} more changed` : ''
      said.push(`Since you last checked ${since}, ${named.join('; ')}${more}.`)
    } else if (changes) {
      said.push(`Nothing has changed since you last checked ${since}.`)
    }
  } else {
    said.push('No one is on it yet.')
  }
  said.push(`Reimbursements: ${lowerFirstWord(reimbursementsSaid(input.reimbursements))}`)
  said.push(`Weather: ${lowerFirstWord(weatherSaid(ev, input.weather, today))}`)

  return {
    key: ev.instanceKey,
    title: ev.title,
    date: ev.date,
    status,
    tasks: { total: mine.length, done: mine.length - open.length, behind, overdue, dueSoon },
    availability: {
      onIt: onIt.length,
      counts,
      changes,
      since: input.seen?.at ?? null,
    },
    text,
    spoken: said.join(' '),
    seen: { at: now, answers },
  }
}

/** "None outstanding." → "none outstanding." — said after a colon. */
function lowerFirstWord(s: string): string {
  return /^(?:I|I’m|I’ll)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

// --- Kept between reports -------------------------------------------------------

/** Kept for events at most this long past, and this many in all. */
const KEEP_PAST_DAYS = 60
const KEEP_MOST = 100

/** The day in an event's key: `${id}_${date}`, or `${id}_${date}_d2`. */
const dayOfKey = (key: string) => /_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(key)?.[1] ?? null

/**
 * Which kept reports to let go, once this one is kept: those for events long
 * past, and the oldest past a hundred — so what is kept stays small.
 */
export function seenToDrop(
  kept: Record<string, ReportSeen>,
  keeping: string,
  today: string
): string[] {
  const cutoff = shiftDate(today, -KEEP_PAST_DAYS)
  const drop = new Set(
    Object.keys(kept).filter((k) => k !== keeping && (dayOfKey(k) ?? '0000') < cutoff)
  )
  const left = Object.entries(kept)
    .filter(([k]) => k !== keeping && !drop.has(k))
    .sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0))
  for (const [k] of left.slice(KEEP_MOST - 1)) drop.add(k)
  return [...drop]
}
