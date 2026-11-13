import {
  assignedTo,
  canSeeEvent,
  carpoolFor,
  dressCodeFor,
  instancesOf,
  reportTimesFor,
  seesTeamSide,
  shiftDate,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Viewer,
  teamsOf,
} from '../../functions/src/miriam/data'
import { nudgeSaid, occasionsSoon, type Occasion, type OccasionNudge } from './occasions'
import { behindOf, type ReportTask } from './eventReport'
import { saleSaid } from './miriamStore'

/**
 * Miriam's daily briefing — "what do I need to know today?" — put together
 * on the device from what the app has: today's events, your tasks, reminders
 * and notes on today (lib/dateNotes), what's new, and, for admins and the
 * worship team, what needs their attention. Shown as a list to tap through,
 * and said aloud.
 *
 * Nothing here is sent anywhere: the same rules decide what each person
 * sees as the screens do (functions/src/miriam/data).
 */

/** "What do I need to know today?", "brief me", "how does my day look?", "good morning". */
export function briefingAsked(text: string): boolean {
  const said = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(spelled)
    .join(' ')
  return BRIEFING_ASKED.some((re) => re.test(said))
}

/**
 * Claude's account of what they asked for, when it was the briefing: "Give
 * me my daily rundown: what I have today, and my open tasks." — the asking
 * comes before the colon or dash, and what it's for after it.
 */
export function briefingUnderstood(understood: string): boolean {
  const asked = understood.split(/:|\s[—–-]\s|;/)[0]
  return briefingAsked(understood) || briefingAsked(asked)
}

/**
 * What may come before it: "can you give me", "tell me", "what's", "let's
 * hear", "pull up", "I'd like", "can I get", "go over", "run me through".
 */
const ASKING = String.raw`(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:give|get|show|read|tell|send|play|bring)\s+me\s+|(?:pull|bring)\s+up\s+|(?:open|start|do|play|read)\s+|what(?:'s|\s+is)\s+|let's\s+(?:hear|have|do|see)\s+|let\s+me\s+(?:hear|have|see)\s+|(?:i\s+(?:want|need)|i'd\s+like)\s+(?:to\s+(?:hear|see|get)\s+)?|(?:can|could|may)\s+i\s+(?:get|have|hear|see)\s+|go\s+over\s+|run\s+(?:me\s+)?through\s+|hit\s+me\s+with\s+)?`
/** Whose and which: "my", "today's", "the daily", "this month's". */
const WHICH = String.raw`(?:(?:my|the|a|today's|this\s+month's)\s+)?`
const WHEN = String.raw`(?:daily|morning|monthly|day's)`
/** What it's called: "briefing", "rundown" — on its own or with a day or month. */
const NAMED = String.raw`(?:briefing|rundown|run-down|run\s+down|lowdown)`
/** Called this only with a day or month to it: a "summary" alone could be of anything. */
const NAMED_WHEN = String.raw`(?:recap|summary|overview|update|report|digest)`
/** What it's for, after it: "for today", "of my day", "for the month". */
const FOR = String.raw`(?:\s+(?:for|of|on)\s+(?:today|the\s+day|my\s+day|the\s+month|this\s+month))?`

const BRIEFING_ASKED: RegExp[] = [
  // "briefing", "daily rundown", "give me my morning briefing", "what's the rundown for today"
  new RegExp(String.raw`^${ASKING}${WHICH}(?:${WHEN}\s+)?${NAMED}${FOR}(?:\s+please)?$`),
  // "daily recap", "today's summary", "a summary of my day", "monthly update"
  new RegExp(String.raw`^${ASKING}${WHICH}${WHEN}\s+${NAMED_WHEN}${FOR}(?:\s+please)?$`),
  // "today's summary", "this month's recap"
  new RegExp(
    String.raw`^${ASKING}(?:today's|this\s+month's)\s+(?:${WHEN}\s+)?${NAMED_WHEN}(?:\s+please)?$`
  ),
  new RegExp(
    String.raw`^${ASKING}${WHICH}${NAMED_WHEN}\s+(?:for|of|on)\s+(?:today|the\s+day|my\s+day|the\s+month|this\s+month)(?:\s+please)?$`
  ),
  /^brief\s+me\b/,
  /\bwhat(?:'s|\s+is)\s+(?:happening|on|coming\s+up)\s+this\s+month\b/,
  /\bwhat\s+do\s+i\s+need\s+to\s+know\b/,
  /\bhow(?:'s|\s+is|\s+does)\s+my\s+day\s+look(?:ing)?\b/,
  /\bwhat(?:'s|\s+is)\s+my\s+day\s+look(?:ing)?\s+like\b/,
  /\bwhat(?:'s|\s+is)\s+(?:on\s+)?my\s+(?:day|agenda)\b/,
  /^good\s+morning(?:\s+miriam)?$/,
  /\bcatch\s+me\s+up\b/,
  /^(?:(?:can|could|would)\s+you\s+)?(?:tell\s+me\s+about|go\s+over|walk\s+me\s+through)\s+(?:my\s+day|today)$/,
]

/**
 * Words that ask for the briefing, as typed in a hurry or heard a little
 * wrong: "breifing", "briefng", "gibe me", "mornin". A word close to one of
 * these is read as it — one letter off, or two letters swapped; "briefing",
 * being long, two off.
 */
const BRIEFING_WORDS: [string, number][] = [
  ['briefing', 2],
  ['brief', 1],
  ['give', 1],
  ['daily', 1],
  ['morning', 1],
  ['monthly', 1],
  ['rundown', 1],
]

function spelled(word: string): string {
  if (word.length < 4) return word
  for (const [right, most] of BRIEFING_WORDS) {
    if (word !== right && editsApart(word, right) <= most) return right
  }
  return word
}

/** Letters added, dropped, changed or two side by side swapped, to get from one word to the other. */
export function editsApart(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

export interface BriefTask {
  id: string
  title: string
  status: string
  dueDate?: string | null
  assignees: (string | number)[]
}

export interface BriefReminder {
  id: string
  text: string
  remindAt: number
  done: boolean
}

/** Something needing an admin's (or the worship team's) attention, found by the app (features/miriam/briefingData). */
export interface AttentionItem {
  kind: 'behind' | 'availability' | 'issue' | 'kaizen' | 'setlist' | 'reimbursement'
  title: string
  sub: string
  href: string
  /** Said aloud. */
  spoken: string
  /** Those who haven't answered: a tap reminds them. */
  remind?: { uids: string[]; eventTitle: string; eventDate: string; eventKey: string }
}

export interface BriefingInput {
  now: Date
  firstName: string
  viewer: Viewer
  groups: Group[]
  names: Map<string, string>
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  tasks: BriefTask[]
  reminders: BriefReminder[]
  announcements: { id: string; title: string; ts: number }[]
  unread: { name: string; count: number }[]
  attention: AttentionItem[]
  /** Today's forecast for an event, by its key: "68°, clear". */
  weather?: Record<string, { high: number; label: string }>
  /** Their events coming up with food still unclaimed, that they haven't signed up for (features/miriam/briefingData). */
  food?: FoodNudge[]
  /** Their own notes on days of their calendar (lib/dateNotes): today's are said. */
  notes?: { id: string; date: string; text: string; at: number }[]
  /** Birthdays and anniversaries on the calendar, for those who see them (lib/occasions): this week's are said. */
  occasions?: Occasion[]
  /**
   * The month's briefing rather than the day's — a public follower's, who has
   * no tasks, team or day-to-day to be told of: the events of the month ahead,
   * and what's new (buildMonthly).
   */
  monthly?: boolean
  /** Videos new in Content, for the month's briefing. */
  newContent?: { id: string; title: string }[]
  /** The Elim Store's sale, if one is on and they have the store (features/miriam/briefingData). */
  sale?: BriefSale | null
  /** What happened to reimbursements since yesterday, theirs or sent to them (lib/reimbursementTally moneyBriefing). */
  money?: BriefMoney[]
  /** An admin's: how many have invited someone to the next Sunday service (lib/inviteLog). */
  invited?: { count: number; date: string; href: string } | null
}

/** A reimbursement decided, paid or a date answered: shown, opened, and said. */
export interface BriefMoney {
  title: string
  sub: string
  href: string
  /** Said aloud: a sentence, without its full stop. */
  spoken: string
}

/** A sale at the Elim Store: its words, its last day as said ("tomorrow"), and where the store is. */
export interface BriefSale {
  message: string
  until: string
  href: string
}

/** An event of theirs with open food items, and one of them suggested. */
export interface FoodNudge {
  eventKey: string
  title: string
  date: string
  open: string[]
  /** One open item, picked at random. */
  suggestion: string
}

export interface BriefEvent {
  key: string
  title: string
  /** "10:00", with "AM" apart; or the day ("Fri", "Oct 23") for what's next. */
  time: string
  meridiem: string
  place: string
  chips: string[]
}

export interface Briefing {
  /** The day's briefing, or a public follower's month's (BriefingInput.monthly). */
  period: 'day' | 'month'
  greeting: string
  /** The day it is for: YYYY-MM-DD. */
  date: string
  dateLine: string
  /** How many things need them: overdue and today's tasks, and attention items. */
  needs: number
  today: BriefEvent[]
  /** Nothing today: the next thing coming up. */
  next: BriefEvent | null
  /**
   * The other events of the days ahead (SOON_DAYS, from tomorrow: Monday's
   * counts on a Friday), each once, their own first — not those above.
   */
  soon: BriefEvent[]
  /** The month's briefing: the events of the month ahead, each once. */
  upcoming: BriefEvent[]
  tasks: (BriefTask & { due: 'overdue' | 'today' | 'week'; label: string })[]
  reminders: BriefReminder[]
  /** Their notes on today, as written. */
  notes: { id: string; text: string }[]
  news: {
    kind: 'announcement' | 'messages' | 'content' | 'invites' | 'reimbursement'
    title: string
    sub: string
    href: string
  }[]
  attention: AttentionItem[]
  /** Food still open on their events: a suggestion each. */
  food: FoodNudge[]
  /** Birthdays and anniversaries this week: whom to wish well. */
  occasions: OccasionNudge[]
  /** A sale on at the Elim Store. */
  sale: BriefSale | null
  spoken: string
  /**
   * What is said, in the order it is said, each with the items on screen it
   * is about (briefingRowId) — so the screen can show each as she reaches it.
   * Their text, joined, is `spoken`.
   */
  segments: BriefingSegment[]
}

export interface BriefingSegment {
  /** The rows it is about: "head", "ev:<key>", "task:<id>", "rem:<id>", "note:<id>", "occ:<key>", "news:<n>", "sale", "food:<eventKey>", "att:<n>". */
  ids: string[]
  text: string
}

/** The id a row on the briefing screen goes by, matching BriefingSegment.ids. */
export const briefingRowId = {
  event: (key: string) => `ev:${key}`,
  task: (id: string) => `task:${id}`,
  reminder: (id: string) => `rem:${id}`,
  note: (id: string) => `note:${id}`,
  occasion: (key: string) => `occ:${key}`,
  news: (n: number) => `news:${n}`,
  sale: () => 'sale',
  food: (eventKey: string) => `food:${eventKey}`,
  attention: (n: number) => `att:${n}`,
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How far ahead "Coming up" looks: a week from today, whatever day it ends on. */
export const SOON_DAYS = 7
/** At most this many coming up. */
const SOON_AT_MOST = 4

/** How far off the briefing looks for an event that's behind. */
export const BEHIND_DAYS = 14
/** At most this many named: the soonest. */
const BEHIND_AT_MOST = 3

/**
 * For an admin: the events coming up (`upcoming`, soonest first) that are
 * behind — a task marked behind, or past due and not done, as the Behind
 * badge reads it (lib/eventReport behindOf). A repeating event once, on its
 * next date. Each opens its Event Health card where it has one.
 */
export function behindAttention(
  upcoming: (EventInstance & { taskTemplateId?: string })[],
  tasks: ReportTask[],
  today: string
): AttentionItem[] {
  const items: AttentionItem[] = []
  const named = new Set<string>()
  for (const ev of upcoming) {
    if (items.length >= BEHIND_AT_MOST) break
    const series = String(ev.templateId)
    if (named.has(series)) continue
    const { behind, overdue } = behindOf(tasks, ev, today)
    if (!behind.length && !overdue.length) continue
    named.add(series)
    const what = [
      behind.length ? `${plural(behind.length, 'task')} behind` : '',
      overdue.length ? `${overdue.length} overdue` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const ahead = Math.round(
      (Date.parse(`${ev.date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000
    )
    const when =
      ahead === 0
        ? 'today'
        : ahead === 1
          ? 'tomorrow'
          : ahead < 7
            ? weekday(ev.date)
            : new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
    const saidWhen = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : `on ${when}`
    items.push({
      kind: 'behind',
      title: `${ev.title} is behind`,
      sub: `${what} · ${when}`,
      href: ev.taskTemplateId
        ? `/assignments?healthEvent=${encodeURIComponent(series)}`
        : '/assignments',
      spoken: `${ev.title} ${saidWhen} is behind, with ${what}`,
    })
  }
  return items
}
const listed = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "5 PM" → ["5:00", "PM"]; "10:30 AM" → ["10:30", "AM"]; anything else as it is. */
function clock(time: string | undefined): [string, string] {
  const m = (time ?? '').match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i)
  if (!m) return [time ?? '', '']
  return [`${m[1]}:${m[2] ?? '00'}`, m[3].toUpperCase()]
}

/**
 * Them, as someone on the event rather than an admin: their own team, dress
 * code and car — none at all for a public follower, whose event pages don't
 * show them (functions/src/miriam/data: seesTeamSide).
 */
const asMember = (viewer: Viewer): Viewer => ({
  uid: viewer.uid,
  roles: seesTeamSide(viewer) ? [] : ['public'],
})

/**
 * When they're to be there, if they are on it: "Report 5:00 PM", or — on
 * teams with different times — "Report times: Worship 5:00 PM, Setup 4:00 PM".
 */
function reportSaid(ev: EventInstance, input: BriefingInput): string {
  const onIt = assignedTo(ev, input.groups).has(input.viewer.uid)
  const times = reportTimesFor(ev, asMember(input.viewer), onIt)
  if (!times.length) return ''
  if (times.length === 1 && !times[0].who) return `Report ${times[0].time}`
  return `Report times: ${times.map((r) => (r.who ? `${r.who} ${r.time}` : r.time)).join(', ')}`
}

/** On the event themselves: its private details are only for them (functions/src/eventPrivate). */
const isOn = (ev: EventInstance, input: BriefingInput) =>
  assignedTo(ev, input.groups).has(input.viewer.uid)

function eventCard(ev: EventInstance, input: BriefingInput, today: string): BriefEvent {
  const me = asMember(input.viewer)
  const sees = seesTeamSide(input.viewer)
  const onIt = sees && isOn(ev, input)
  const teams = onIt ? teamsOf(ev, input.viewer.uid) : []
  const dress = onIt ? dressCodeFor(ev, me)[0] : undefined
  const car = onIt && ev.carpool ? carpoolFor(ev, me, input.names)[0] : undefined
  const forecast = sees ? input.weather?.[ev.instanceKey] : undefined
  const report = reportSaid(ev, input)
  const chips = [
    ...teams.map((t) => `${t.name} team`),
    report,
    dress ?? '',
    car ? car.replace(/\s*\(your car\)/, '') : '',
    forecast ? `${Math.round(forecast.high)}°, ${forecast.label.toLowerCase()}` : '',
  ].filter(Boolean)
  const [time, meridiem] =
    ev.date === today
      ? clock(ev.startTime)
      : [
          new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
          new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
        ]
  const place = ev.isVirtual
    ? 'Online'
    : [ev.location, ev.city].filter(Boolean).join(', ') ||
      (ev.date !== today && ev.startTime ? ev.startTime : '')
  return { key: ev.instanceKey, title: ev.title, time, meridiem, place, chips }
}

/** Events this person can see between two dates, theirs first, then by date and time. */
function eventsBetween(input: BriefingInput, from: string, to: string): EventInstance[] {
  const { templates, overrides, groups, viewer } = input
  const minutes = (t?: string) => {
    const m = (t ?? '').match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i)
    if (!m) return 24 * 60
    const h = (Number(m[1]) % 12) + (m[3]?.toLowerCase() === 'pm' ? 12 : 0)
    return h * 60 + Number(m[2] ?? 0)
  }
  return templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, from, to, overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups))
    .sort((a, b) => a.date.localeCompare(b.date) || minutes(a.startTime) - minutes(b.startTime))
}

export function buildBriefing(input: BriefingInput): Briefing {
  if (input.monthly) return buildMonthly(input)
  const { now, viewer, groups } = input
  const today = localDate(now)
  const hour = now.getHours()
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}${input.firstName ? `, ${input.firstName}` : ''}`

  // Today's events: theirs, and anything public they can see.
  const todays = eventsBetween(input, today, today)
  const mineToday = todays.filter((ev) => assignedTo(ev, groups).has(viewer.uid))
  const shownToday = (mineToday.length ? mineToday : todays).slice(0, 4)
  const today_ = shownToday.map((ev) => eventCard(ev, input, today))
  let next: BriefEvent | null = null
  let nextEv: EventInstance | undefined
  if (today_.length === 0) {
    const ahead = eventsBetween(input, shiftDate(today, 1), shiftDate(today, 60))
    nextEv = ahead.find((ev) => assignedTo(ev, groups).has(viewer.uid)) ?? ahead[0]
    if (nextEv) next = eventCard(nextEv, input, today)
  }

  // Coming up: the other events of the week ahead, counted from today, not
  // to the week's end — each once (a weekly one on its next date), none
  // already shown above; their own kept first when there are more.
  const shownSeries = new Set(
    [...shownToday, ...(nextEv ? [nextEv] : [])].map((ev) => String(ev.templateId))
  )
  const ahead = eventsBetween(input, shiftDate(today, 1), shiftDate(today, SOON_DAYS)).filter(
    (ev) => {
      const series = String(ev.templateId)
      if (shownSeries.has(series)) return false
      shownSeries.add(series)
      return true
    }
  )
  const own = (ev: EventInstance) => assignedTo(ev, groups).has(viewer.uid)
  const kept = new Set(
    [...ahead.filter(own), ...ahead.filter((ev) => !own(ev))].slice(0, SOON_AT_MOST)
  )
  const soonEvs = ahead.filter((ev) => kept.has(ev))
  const soon = soonEvs.map((ev) => eventCard(ev, input, today))

  // Their tasks: overdue, due today, then due this week.
  const weekEnd = shiftDate(today, 7)
  const tasks = input.tasks
    .filter((t) => t.status !== 'done' && t.assignees.some((a) => String(a) === viewer.uid))
    .filter((t) => !!t.dueDate && t.dueDate <= weekEnd)
    .map((t) => {
      const d = t.dueDate as string
      const late = Math.round(
        (new Date(`${today}T12:00:00`).getTime() - new Date(`${d}T12:00:00`).getTime()) / 86_400_000
      )
      const due: 'overdue' | 'today' | 'week' =
        d < today ? 'overdue' : d === today ? 'today' : 'week'
      const label =
        due === 'overdue'
          ? `${plural(late, 'day')} overdue`
          : due === 'today'
            ? 'Due today'
            : `Due ${weekday(d)}`
      return { ...t, due, label }
    })
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 6)

  // Today's reminders still to come, and any missed today.
  const endOfDay = new Date(`${today}T23:59:59`).getTime()
  const startOfDay = new Date(`${today}T00:00:00`).getTime()
  const reminders = input.reminders
    .filter((r) => !r.done && r.remindAt >= startOfDay && r.remindAt <= endOfDay)
    .sort((a, b) => a.remindAt - b.remindAt)

  const news: Briefing['news'] = input.announcements.slice(0, 3).map((a) => ({
    kind: 'announcement' as const,
    title: a.title,
    sub: 'Announcement',
    href: '/announce',
  }))
  // People bringing friends to the next Sunday service: an admin's to know.
  const invited = input.invited?.count ? input.invited : null
  if (invited) {
    news.push({
      kind: 'invites',
      title: `${plural(invited.count, 'person', 'people')} invited someone to the next Sunday service`,
      sub: longDate(invited.date),
      href: invited.href,
    })
  }
  const unreadTotal = input.unread.reduce((n, u) => n + u.count, 0)
  if (unreadTotal) {
    news.push({
      kind: 'messages',
      title: `${plural(unreadTotal, 'unread message')}`,
      sub: input.unread
        .slice(0, 3)
        .map((u) => `${u.name} (${u.count})`)
        .join(' · '),
      href: '/messages',
    })
  }

  const money = (input.money ?? []).slice(0, 4)
  for (const m of money) {
    news.push({ kind: 'reimbursement', title: m.title, sub: m.sub, href: m.href })
  }

  const attention = input.attention.slice(0, 5)
  // A food sheet is its team's: never nudged to anyone holding the public role.
  const food = seesTeamSide(input.viewer) ? (input.food ?? []).slice(0, 2) : []
  const notes = (input.notes ?? [])
    .filter((n) => n.date === today)
    .sort((a, b) => a.at - b.at)
    .map((n) => ({ id: n.id, text: n.text }))
  const occasions = occasionsSoon(input.occasions ?? [], today, viewer.uid, input.names)
  const needs =
    tasks.filter((t) => t.due !== 'week').length +
    attention.length +
    reminders.length +
    food.length +
    notes.length

  // Said aloud: in the same order, a sentence or two for each — each part
  // with the rows it is about.
  const segments: BriefingSegment[] = []
  const say = (ids: string[], text: string) => segments.push({ ids, text })
  const R = briefingRowId
  say(['head'], `${greeting}. Today is ${longDate(today)}.`)
  if (shownToday.length) {
    say(
      shownToday.map((ev) => R.event(ev.instanceKey)),
      shownToday.length === 1
        ? 'You have one event today.'
        : `You have ${shownToday.length} events today.`
    )
    shownToday.forEach((ev, i) => {
      const card = today_[i]
      const bits = [
        `${i > 0 ? 'Then ' : ''}${ev.title}${ev.startTime ? ` at ${ev.startTime}` : ''}${card.place && !ev.isVirtual ? `, at ${card.place}` : ev.isVirtual ? ', online' : ''}.`,
      ]
      // Every team they're on: someone can be on several.
      const teams = card.chips
        .filter((c) => c.endsWith(' team'))
        .map((c) => c.replace(/ team$/, ''))
      if (teams.length) bits.push(`You're on ${listed(teams)}.`)
      const report = reportSaid(ev, input)
      if (report) bits.push(`${report.replace(/^Report (?=\d)/, 'Report at ')}.`)
      const onIt = seesTeamSide(viewer) && isOn(ev, input)
      const dress = onIt ? dressCodeFor(ev, asMember(viewer))[0] : undefined
      if (dress) bits.push(`Dress code: ${dress}.`)
      const car = onIt && ev.carpool ? carpoolFor(ev, asMember(viewer), input.names)[0] : undefined
      if (car) bits.push(`Your car: ${car.replace(/\s*\(your car\)/, '')}.`)
      const forecast = seesTeamSide(viewer) ? input.weather?.[ev.instanceKey] : undefined
      if (forecast)
        bits.push(`It'll be ${Math.round(forecast.high)} and ${forecast.label.toLowerCase()}.`)
      say([R.event(ev.instanceKey)], bits.join(' '))
    })
  } else if (next) {
    say(
      [R.event(next.key)],
      `Nothing on today. Next up is ${next.title}, ${weekday(eventsKeyDate(next.key))}.`
    )
  } else {
    say(['head'], 'Nothing on today.')
  }
  if (soonEvs.length) {
    const dayOf = (date: string) =>
      date === shiftDate(today, 1) ? 'tomorrow' : `on ${weekday(date)}`
    say(
      soonEvs.map((ev) => R.event(ev.instanceKey)),
      `Coming up: ${listed(soonEvs.map((ev) => `${ev.title} ${dayOf(ev.date)}`))}.`
    )
  }
  const overdue = tasks.filter((t) => t.due === 'overdue')
  const dueToday = tasks.filter((t) => t.due === 'today')
  const thisWeek = tasks.filter((t) => t.due === 'week')
  const taskIds = (ts: typeof tasks) => ts.map((t) => R.task(t.id))
  if (overdue.length)
    say(
      taskIds(overdue),
      `${overdue.length === 1 ? 'One task is' : `${overdue.length} tasks are`} overdue: ${listed(overdue.map((t) => t.title))}.`
    )
  if (dueToday.length) say(taskIds(dueToday), `Due today: ${listed(dueToday.map((t) => t.title))}.`)
  if (thisWeek.length)
    say(
      taskIds(thisWeek),
      `${plural(thisWeek.length, 'more task')} due this week${thisWeek.length === 1 ? `: ${thisWeek[0].title}` : ''}.`
    )
  if (reminders.length)
    say(
      reminders.map((r) => R.reminder(r.id)),
      `Reminders today: ${listed(
        reminders.map(
          (r) =>
            `${lowerFirst(r.text)} at ${new Date(r.remindAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '')}`
        )
      )}.`
    )
  if (notes.length) {
    const said = notes.map((n) => n.text.replace(/[.!?]+$/, ''))
    say(
      notes.map((n) => R.note(n.id)),
      `${notes.length === 1 ? 'Your note for today' : 'Your notes for today'}: ${said.join('; ')}.`
    )
  }
  // Birthdays and anniversaries this week: whom to wish well.
  for (const o of occasions) say([R.occasion(o.key)], nudgeSaid(o, today))
  const announcements = news.filter((n) => n.kind === 'announcement')
  if (announcements.length)
    say(
      news.flatMap((n, i) => (n.kind === 'announcement' ? [R.news(i)] : [])),
      `${announcements.length === 1 ? 'A new announcement' : `${announcements.length} new announcements`}: ${listed(announcements.map((a) => a.title))}.`
    )
  if (invited)
    say(
      news.flatMap((n, i) => (n.kind === 'invites' ? [R.news(i)] : [])),
      `${plural(invited.count, 'person', 'people')} invited someone to the next Sunday service.`
    )
  if (unreadTotal)
    say(
      news.flatMap((n, i) => (n.kind === 'messages' ? [R.news(i)] : [])),
      `You have ${plural(unreadTotal, 'unread message')}.`
    )
  if (money.length)
    say(
      news.flatMap((n, i) => (n.kind === 'reimbursement' ? [R.news(i)] : [])),
      money.map((m) => `${m.spoken.charAt(0).toUpperCase()}${m.spoken.slice(1)}.`).join(' ')
    )
  const sale = input.sale ?? null
  if (sale) say([R.sale()], storeSaleSaid(sale))
  for (const f of food) {
    const when = f.date === today ? 'today' : weekday(f.date)
    say(
      [R.food(f.eventKey)],
      `${f.title} ${when} still has ${f.open.length === 1 ? 'an open food item' : 'open food items'}. How about bringing ${lowerFirst(f.suggestion)}?`
    )
  }
  if (attention.length)
    say(
      attention.map((_, i) => R.attention(i)),
      `Needs your attention: ${attention.map((a) => a.spoken).join('; ')}.`
    )

  return {
    period: 'day',
    greeting,
    date: today,
    dateLine: `${longDate(today)}${needs ? ` · ${plural(needs, 'thing')} ${needs === 1 ? 'needs' : 'need'} you` : ' · You’re caught up'}`,
    needs,
    today: today_,
    next,
    soon,
    upcoming: [],
    tasks,
    reminders,
    notes,
    news,
    attention,
    food,
    occasions,
    sale,
    spoken: segments.map((x) => x.text).join(' '),
    segments,
  }
}

/** "There’s a sale at the Elim Store: All shirts are 10% off. It ends tomorrow." (lib/miriamStore) */
const storeSaleSaid = (sale: BriefSale) => saleSaid(sale.message, sale.until)

/** The date in an instance key (`<templateId>_<YYYY-MM-DD>`). */
const eventsKeyDate = (key: string) => key.slice(key.lastIndexOf('_') + 1)

/** How far ahead the month's briefing looks. */
const MONTH_DAYS = 30
/** At most this many of the month's events on its screen, and said aloud. */
const MONTH_SHOWN = 8
const MONTH_SAID = 5

/**
 * A public follower's briefing, offered once a month (features/miriam
 * useBriefing): the events of the month ahead — a weekly one once, with its
 * other dates — what was announced this past month, and what's new in
 * Content. Nothing of a day: they have no tasks, team, car or reminders.
 */
function buildMonthly(input: BriefingInput): Briefing {
  const { now } = input
  const today = localDate(now)
  const hour = now.getHours()
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}${input.firstName ? `, ${input.firstName}` : ''}`
  const month = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Each event once — its first date in the month — with its others after it.
  const all = eventsBetween(input, today, shiftDate(today, MONTH_DAYS))
  const firsts: EventInstance[] = []
  const more = new Map<string, string[]>()
  for (const ev of all) {
    const id = ev.templateId
    if (more.has(id)) more.get(id)!.push(ev.date)
    else {
      more.set(id, [])
      firsts.push(ev)
    }
  }
  const shortDay = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const shown = firsts.slice(0, MONTH_SHOWN)
  const upcoming = shown.map((ev) => {
    // Each by its day — today's too, in a list of days.
    const card = eventCard(ev, input, '')
    const also = more.get(ev.templateId) ?? []
    return also.length
      ? {
          ...card,
          chips: [...card.chips, `Also ${listed(also.map(shortDay)).replace(/ and /, ' & ')}`],
        }
      : card
  })

  const news: Briefing['news'] = [
    ...input.announcements.slice(0, 3).map((a) => ({
      kind: 'announcement' as const,
      title: a.title,
      sub: 'Announcement',
      href: '/announce',
    })),
    ...(input.newContent ?? []).slice(0, 3).map((c) => ({
      kind: 'content' as const,
      title: c.title,
      sub: 'New in Content',
      href: '/music',
    })),
  ]

  const segments: BriefingSegment[] = []
  const say = (ids: string[], text: string) => segments.push({ ids, text })
  const R = briefingRowId
  say(['head'], `${greeting}. Here’s your month.`)
  if (shown.length) {
    say(
      shown.map((ev) => R.event(ev.instanceKey)),
      firsts.length === 1
        ? 'There’s one event coming up.'
        : `There are ${firsts.length} events coming up.`
    )
    shown.slice(0, MONTH_SAID).forEach((ev, i) => {
      const card = upcoming[i]
      const place = ev.isVirtual
        ? ', online'
        : card.place && card.place !== ev.startTime
          ? `, at ${card.place}`
          : ''
      const again = (more.get(ev.templateId) ?? []).length
      say(
        [R.event(ev.instanceKey)],
        `${ev.title} on ${longDate(ev.date)}${ev.startTime ? ` at ${ev.startTime}` : ''}${place}${again ? `, and ${again === 1 ? 'once more' : `${again} more times`} after that` : ''}.`
      )
    })
    if (firsts.length > MONTH_SAID)
      say(
        shown.slice(MONTH_SAID).map((ev) => R.event(ev.instanceKey)),
        `And ${plural(firsts.length - MONTH_SAID, 'more')} on the calendar.`
      )
  } else {
    say(['head'], 'Nothing is on the calendar for the month ahead yet.')
  }
  const announced = news.filter((n) => n.kind === 'announcement')
  if (announced.length)
    say(
      news.flatMap((n, i) => (n.kind === 'announcement' ? [R.news(i)] : [])),
      `${announced.length === 1 ? 'An announcement' : `${announced.length} announcements`} this past month: ${listed(announced.map((a) => a.title))}.`
    )
  const added = news.filter((n) => n.kind === 'content')
  if (added.length)
    say(
      news.flatMap((n, i) => (n.kind === 'content' ? [R.news(i)] : [])),
      `New in Content: ${listed(added.map((c) => c.title))}.`
    )
  const sale = input.sale ?? null
  if (sale) say([R.sale()], storeSaleSaid(sale))

  return {
    period: 'month',
    greeting,
    date: today,
    dateLine: `${month} · ${firsts.length ? `${plural(firsts.length, 'event')} coming up` : 'Nothing on the calendar yet'}`,
    needs: 0,
    today: [],
    next: null,
    soon: [],
    upcoming,
    tasks: [],
    reminders: [],
    notes: [],
    news,
    attention: [],
    food: [],
    occasions: [],
    sale,
    spoken: segments.map((x) => x.text).join(' '),
    segments,
  }
}
