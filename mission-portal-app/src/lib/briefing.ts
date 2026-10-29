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
  return /^(?:(?:can|could|would)\s+you\s+)?(?:give\s+me\s+)?(?:(?:my|the|a|today's)\s+)?(?:daily\s+|morning\s+)?briefing(?:\s+for\s+today)?(?:\s+please)?$|^brief\s+me\b|\bwhat\s+do\s+i\s+need\s+to\s+know\b|\bhow(?:'s|\s+is|\s+does)\s+my\s+day\s+look(?:ing)?\b|\bwhat(?:'s|\s+is)\s+my\s+day\s+look(?:ing)?\s+like\b|\bwhat(?:'s|\s+is)\s+(?:on\s+)?my\s+(?:day|agenda)\b|^good\s+morning(?:\s+miriam)?$|\bcatch\s+me\s+up\b/.test(
    said
  )
}

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
  kind: 'availability' | 'issue' | 'kaizen' | 'setlist' | 'reimbursement'
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
  greeting: string
  /** The day it is for: YYYY-MM-DD. */
  date: string
  dateLine: string
  /** How many things need them: overdue and today's tasks, and attention items. */
  needs: number
  today: BriefEvent[]
  /** Nothing today: the next thing coming up. */
  next: BriefEvent | null
  tasks: (BriefTask & { due: 'overdue' | 'today' | 'week'; label: string })[]
  reminders: BriefReminder[]
  /** Their notes on today, as written. */
  notes: { id: string; text: string }[]
  news: { kind: 'announcement' | 'messages'; title: string; sub: string; href: string }[]
  attention: AttentionItem[]
  /** Food still open on their events: a suggestion each. */
  food: FoodNudge[]
  /** Birthdays and anniversaries this week: whom to wish well. */
  occasions: OccasionNudge[]
  spoken: string
  /**
   * What is said, in the order it is said, each with the items on screen it
   * is about (briefingRowId) — so the screen can show each as she reaches it.
   * Their text, joined, is `spoken`.
   */
  segments: BriefingSegment[]
}

export interface BriefingSegment {
  /** The rows it is about: "head", "ev:<key>", "task:<id>", "rem:<id>", "note:<id>", "occ:<key>", "news:<n>", "food:<eventKey>", "att:<n>". */
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

function eventCard(ev: EventInstance, input: BriefingInput, today: string): BriefEvent {
  const me = asMember(input.viewer)
  const sees = seesTeamSide(input.viewer)
  const teams = sees ? teamsOf(ev, input.viewer.uid) : []
  const dress = dressCodeFor(ev, me)[0]
  const car = ev.carpool ? carpoolFor(ev, me, input.names)[0] : undefined
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
  if (today_.length === 0) {
    const ahead = eventsBetween(input, shiftDate(today, 1), shiftDate(today, 60))
    const nextEv = ahead.find((ev) => assignedTo(ev, groups).has(viewer.uid)) ?? ahead[0]
    if (nextEv) next = eventCard(nextEv, input, today)
  }

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
      const dress = dressCodeFor(ev, asMember(viewer))[0]
      if (dress) bits.push(`Dress code: ${dress}.`)
      const car = ev.carpool ? carpoolFor(ev, asMember(viewer), input.names)[0] : undefined
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
  if (unreadTotal)
    say(
      news.flatMap((n, i) => (n.kind === 'messages' ? [R.news(i)] : [])),
      `You have ${plural(unreadTotal, 'unread message')}.`
    )
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
    greeting,
    date: today,
    dateLine: `${longDate(today)}${needs ? ` · ${plural(needs, 'thing')} ${needs === 1 ? 'needs' : 'need'} you` : ' · You’re caught up'}`,
    needs,
    today: today_,
    next,
    tasks,
    reminders,
    notes,
    news,
    attention,
    food,
    occasions,
    spoken: segments.map((x) => x.text).join(' '),
    segments,
  }
}

/** The date in an instance key (`<templateId>_<YYYY-MM-DD>`). */
const eventsKeyDate = (key: string) => key.slice(key.lastIndexOf('_') + 1)
