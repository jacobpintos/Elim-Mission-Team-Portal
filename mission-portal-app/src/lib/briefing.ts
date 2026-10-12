import {
  assignedTo,
  canSeeEvent,
  carpoolFor,
  dressCodeFor,
  instancesOf,
  shiftDate,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Viewer,
} from '../../functions/src/miriam/data'

/**
 * Miriam's daily briefing — "what do I need to know today?" — put together
 * on the device from what the app has: today's events, your tasks and
 * reminders, what's new, and, for admins and the worship team, what needs
 * their attention. Shown as a list to tap through, and said aloud.
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
  return /^(?:(?:can|could|would)\s+you\s+)?(?:give\s+me\s+)?(?:(?:my|the|a|today's)\s+)?(?:daily\s+|morning\s+)?briefing(?:\s+for\s+today)?(?:\s+please)?$|^brief\s+me\b|\bwhat\s+do\s+i\s+need\s+to\s+know\b|\bhow(?:'s|\s+is|\s+does)\s+my\s+day\s+look(?:ing)?\b|\bwhat(?:'s|\s+is)\s+my\s+day\s+look(?:ing)?\s+like\b|\bwhat(?:'s|\s+is)\s+(?:on\s+)?my\s+(?:day|agenda)\b|^good\s+morning(?:\s+miriam)?$|\bcatch\s+me\s+up\b/.test(
    said
  )
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
  kind: 'availability' | 'issue' | 'kaizen' | 'setlist'
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
  dateLine: string
  /** How many things need them: overdue and today's tasks, and attention items. */
  needs: number
  today: BriefEvent[]
  /** Nothing today: the next thing coming up. */
  next: BriefEvent | null
  tasks: (BriefTask & { due: 'overdue' | 'today' | 'week'; label: string })[]
  reminders: BriefReminder[]
  news: { kind: 'announcement' | 'messages'; title: string; sub: string; href: string }[]
  attention: AttentionItem[]
  /** Food still open on their events: a suggestion each. */
  food: FoodNudge[]
  spoken: string
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

/** Them, as someone on the event rather than an admin: their own team, dress code and car. */
const asMember = (viewer: Viewer): Viewer => ({ uid: viewer.uid, roles: [] })

function eventCard(ev: EventInstance, input: BriefingInput, today: string): BriefEvent {
  const me = asMember(input.viewer)
  const team = (ev.teams ?? []).find((t) =>
    [...t.leaders, ...t.members].some((m) => String(m) === input.viewer.uid)
  )
  const dress = dressCodeFor(ev, me)[0]
  const car = ev.carpool ? carpoolFor(ev, me, input.names)[0] : undefined
  const forecast = input.weather?.[ev.instanceKey]
  const chips = [
    team ? `${team.name} team` : '',
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
  const food = (input.food ?? []).slice(0, 2)
  const needs =
    tasks.filter((t) => t.due !== 'week').length + attention.length + reminders.length + food.length

  // Said aloud: in the same order, a sentence or two for each.
  const parts: string[] = [`${greeting}. Today is ${longDate(today)}.`]
  if (shownToday.length) {
    parts.push(
      shownToday.length === 1
        ? 'You have one event today.'
        : `You have ${shownToday.length} events today.`
    )
    shownToday.forEach((ev, i) => {
      const card = today_[i]
      const bits = [
        `${i > 0 ? 'Then ' : ''}${ev.title}${ev.startTime ? ` at ${ev.startTime}` : ''}${card.place && !ev.isVirtual ? `, at ${card.place}` : ev.isVirtual ? ', online' : ''}.`,
      ]
      const team = card.chips.find((c) => c.endsWith(' team'))
      if (team) bits.push(`You're on ${team.replace(/ team$/, '')}.`)
      const dress = dressCodeFor(ev, asMember(viewer))[0]
      if (dress) bits.push(`Dress code: ${dress}.`)
      const car = ev.carpool ? carpoolFor(ev, asMember(viewer), input.names)[0] : undefined
      if (car) bits.push(`Your car: ${car.replace(/\s*\(your car\)/, '')}.`)
      const forecast = input.weather?.[ev.instanceKey]
      if (forecast)
        bits.push(`It'll be ${Math.round(forecast.high)} and ${forecast.label.toLowerCase()}.`)
      parts.push(bits.join(' '))
    })
  } else if (next) {
    parts.push(`Nothing on today. Next up is ${next.title}, ${weekday(eventsKeyDate(next.key))}.`)
  } else {
    parts.push('Nothing on today.')
  }
  const overdue = tasks.filter((t) => t.due === 'overdue')
  const dueToday = tasks.filter((t) => t.due === 'today')
  const thisWeek = tasks.filter((t) => t.due === 'week')
  if (overdue.length)
    parts.push(
      `${overdue.length === 1 ? 'One task is' : `${overdue.length} tasks are`} overdue: ${listed(overdue.map((t) => t.title))}.`
    )
  if (dueToday.length) parts.push(`Due today: ${listed(dueToday.map((t) => t.title))}.`)
  if (thisWeek.length)
    parts.push(
      `${plural(thisWeek.length, 'more task')} due this week${thisWeek.length === 1 ? `: ${thisWeek[0].title}` : ''}.`
    )
  if (reminders.length)
    parts.push(
      `Reminders today: ${listed(
        reminders.map(
          (r) =>
            `${lowerFirst(r.text)} at ${new Date(r.remindAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '')}`
        )
      )}.`
    )
  const announcements = news.filter((n) => n.kind === 'announcement')
  if (announcements.length)
    parts.push(
      `${announcements.length === 1 ? 'A new announcement' : `${announcements.length} new announcements`}: ${listed(announcements.map((a) => a.title))}.`
    )
  if (unreadTotal) parts.push(`You have ${plural(unreadTotal, 'unread message')}.`)
  for (const f of food) {
    const when = f.date === today ? 'today' : weekday(f.date)
    parts.push(
      `${f.title} ${when} still has ${f.open.length === 1 ? 'an open food item' : 'open food items'}. How about bringing ${lowerFirst(f.suggestion)}?`
    )
  }
  if (attention.length)
    parts.push(`Needs your attention: ${attention.map((a) => a.spoken).join('; ')}.`)

  return {
    greeting,
    dateLine: `${longDate(today)}${needs ? ` · ${plural(needs, 'thing')} ${needs === 1 ? 'needs' : 'need'} you` : ' · You’re caught up'}`,
    needs,
    today: today_,
    next,
    tasks,
    reminders,
    news,
    attention,
    food,
    spoken: parts.join(' '),
  }
}

/** The date in an instance key (`<templateId>_<YYYY-MM-DD>`). */
const eventsKeyDate = (key: string) => key.slice(key.lastIndexOf('_') + 1)
