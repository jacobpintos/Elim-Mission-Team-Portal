import {
  assignedTo,
  canSeeEvent,
  carpoolFor,
  dressCodeFor,
  findEvents,
  flightsFor,
  instancesOf,
  lodgingFor,
  shiftDate,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Viewer,
} from '../../functions/src/miriam/data'

/**
 * Questions about an event that the app can answer from what it already has
 * — "What's the dress code today?", "Where is Revival?", "Who's in my car
 * for the retreat?" — answered on the device, without asking Claude, from
 * the same rules the server uses (functions/src/miriam/data): the same
 * events this person can see, the same dress code for their team, their own
 * car, room and flight.
 *
 * Anything less plain — no event named or dated, too many events, a field
 * not here — is left to Claude: null.
 */

export type QuickField =
  | 'dress'
  | 'time'
  | 'place'
  | 'team'
  | 'car'
  | 'lodging'
  | 'flight'
  | 'weather'

export interface QuickAsk {
  field: QuickField
  /** The day asked about (YYYY-MM-DD), if one was. */
  date: string | null
  /** The words naming the event, if any: "revival", "sunday service". */
  name: string
}

const FIELDS: [QuickField, RegExp][] = [
  ['weather', /\b(?:weather|rain|raining|forecast|temperature|how\s+(?:hot|cold|warm))\b/],
  [
    'lodging',
    /\b(?:where\s+am\s+i\s+staying|where\s+(?:do|will)\s+i\s+(?:stay|sleep)|hotel|lodging|my\s+room)\b/,
  ],
  [
    'flight',
    /\b(?:my\s+flights?|flights?\s+(?:info|details|time)|when\s+(?:do|does)\s+(?:i|my\s+flight)\s+(?:fly|leave|depart))\b/,
  ],
  [
    'car',
    /\b(?:my\s+car|my\s+ride|carpool|who(?:'s|\s+is)\s+driving|who\s+am\s+i\s+riding\s+with|who(?:'s|\s+is)\s+in\s+my\s+car)\b/,
  ],
  ['dress', /\b(?:dress\s*code|wear|wearing|attire|outfit)\b/],
  ['team', /\b(?:my\s+team|what\s+team|which\s+team)\b/],
  ['place', /\b(?:where\s+is|where's|wheres|where\s+are\s+we|location|address|venue|directions)\b/],
  ['time', /^(?:when\s+is|when's|whens|what\s+time)\b|\bstart\s+time\b|\bwhat\s+time\b/],
]

/** Asked about many, or something only Claude can work out: left to Claude. */
const NOT_QUICK =
  /\b(?:everyone|everybody|who\s+(?:is|isn't|is\s+not)\s+(?:available|coming|going)|availab|unavailable|report\s+time|call\s+time|food|bring|task|due|all\s+(?:the\s+)?events|this\s+week|next\s+week|this\s+month)\b/

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Words that are part of the asking, not the event's name. */
const ASKING = new Set([
  'what',
  'whats',
  'what’s',
  'is',
  'the',
  'a',
  'an',
  'for',
  'of',
  'at',
  'to',
  'in',
  'on',
  'my',
  'i',
  'am',
  'are',
  'we',
  'do',
  'does',
  'will',
  'should',
  'be',
  'event',
  'events',
  'service',
  'today',
  'tonight',
  'tomorrow',
  'this',
  'next',
  'when',
  'whens',
  'where',
  'wheres',
  'where’s',
  'who',
  'whos',
  'who’s',
  'which',
  'time',
  'start',
  'starts',
  'starting',
  'dress',
  'code',
  'wear',
  'wearing',
  'attire',
  'outfit',
  'team',
  'car',
  'ride',
  'carpool',
  'driving',
  'riding',
  'with',
  'staying',
  'stay',
  'sleep',
  'hotel',
  'lodging',
  'room',
  'flight',
  'flights',
  'info',
  'details',
  'location',
  'address',
  'venue',
  'directions',
  'going',
  'go',
  'it',
  'there',
  'and',
  'hey',
  'miriam',
  'please',
  'can',
  'you',
  'tell',
  'me',
  'remind',
  'again',
  'now',
  'our',
  'your',
  'leave',
  'depart',
  'fly',
  'weather',
  'rain',
  'raining',
  'forecast',
  'temperature',
  'hot',
  'cold',
  'warm',
  'how',
  'gonna',
  'going',
  'it',
  'there',
  'any',
  'like',
  'its',
  'it’s',
  'whats',
  'so',
  'okay',
  'ok',
  ...WEEKDAYS,
])

/** "the dress code for Revival today", as what is asked, of which day and event. */
export function quickAsked(text: string, today: string): QuickAsk | null {
  const said = text
    .toLowerCase()
    .replace(/[’']/g, '’')
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const plain = said.replace(/’/g, "'")
  if (NOT_QUICK.test(plain)) return null
  const field = FIELDS.find(([, re]) => re.test(plain))?.[0]
  if (!field) return null

  const ref = eventRef(said, today)
  if (!ref) return null
  return { field, ...ref }
}

/**
 * Which event was meant: a day ("today", "Friday", "next Sunday") and the
 * words left naming it ("revival"), once the asking words are taken off.
 * Null when there is neither. `extra`: more asking words to take off.
 */
export function eventRef(
  said: string,
  today: string,
  extra: ReadonlySet<string> = new Set()
): { date: string | null; name: string } | null {
  const plain = said.replace(/’/g, "'")
  let date: string | null = null
  if (/\b(?:today|tonight|this\s+(?:morning|afternoon|evening))\b/.test(plain)) date = today
  else if (/\btomorrow\b/.test(plain)) date = shiftDate(today, 1)
  else {
    const day = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(plain))
    if (day >= 0) {
      const now = new Date(`${today}T12:00:00`).getDay()
      // The next one: today, if it is that day; "next Sunday" a week on from that.
      let ahead = (day - now + 7) % 7
      if (/\bnext\s+\w+day\b/.test(plain) && ahead === 0) ahead = 7
      date = shiftDate(today, ahead)
    }
  }
  // "Sunday service" is an event's name as much as a day: kept as a name too.
  const name = said
    .split(' ')
    .filter((w) => !ASKING.has(w) && !extra.has(w))
    .join(' ')
    .trim()
  const sundayService = /\bsunday\s+service\b/.test(plain)
  if (!date && !name && !sundayService) return null
  return { date, name: sundayService ? `sunday service ${name}`.trim() : name }
}

export interface QuickData {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  groups: Group[]
  viewer: Viewer
  names: Map<string, string>
  today: string
}

export interface QuickAnswer {
  text: string
  /** The one event answered about, to open at what was asked. */
  open: { key: string; section: 'dress_code' | 'details' | 'weather' } | null
  /** Asked the weather: the events to fetch a forecast for (lib/weather), and say with weatherLine. */
  weather?: EventInstance[]
}

/** The events asked about: on that day, or by that name (nearest first). */
function eventsFor(ask: QuickAsk, data: QuickData): EventInstance[] {
  const { templates, overrides, groups, viewer, today } = data
  const found = findEvents(templates, overrides, groups, viewer, ask.name, today, ask.date ?? '', 6)
  if (ask.date || !ask.name) return found
  // By name alone: the nearest upcoming one of the best fit.
  const upcoming = found.filter((ev) => ev.date >= today)
  return upcoming.length ? [upcoming[0]] : found.slice(0, 1)
}

/** When an event is, as said: "today", "tomorrow", "Sunday, Oct 18". */
function whenSaid(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === shiftDate(today, 1)) return 'tomorrow'
  const d = new Date(`${date}T12:00:00`)
  return `on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
}

const sameId = (a: unknown, b: unknown) => String(a) === String(b)

/** One event's answer, as a sentence or two. */
function answerFor(field: QuickField, ev: EventInstance, data: QuickData, alone: boolean): string {
  const { viewer, names, today } = data
  const title = ev.title
  switch (field) {
    case 'dress': {
      const codes = dressCodeFor(ev, viewer)
      if (!codes.length) return `${title} has no dress code set.`
      return alone
        ? `The dress code for ${title} is ${codes.join('; ')}.`
        : `${title}: ${codes.join('; ')}.`
    }
    case 'time': {
      const when = whenSaid(ev.date, today)
      return ev.startTime
        ? `${title} is ${when} at ${ev.startTime}.`
        : `${title} is ${when}; no time is set.`
    }
    case 'place': {
      if (ev.isVirtual)
        return `${title} is virtual${ev.virtualLink ? ' — the link is on its page' : ''}.`
      const where = [ev.location, [ev.address, ev.city, ev.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')
      return where ? `${title} is at ${where}.` : `${title} has no place set yet.`
    }
    case 'team': {
      const team = (ev.teams ?? []).find((t) =>
        [...t.leaders, ...t.members].some((m) => sameId(m, viewer.uid))
      )
      return team
        ? `You’re on the ${team.name} team for ${title}.`
        : `You’re not on a team for ${title}.`
    }
    case 'car': {
      if (!ev.carpool) return `${title} has no carpool.`
      const cars = carpoolFor(ev, viewer, names)
      return cars.length
        ? `${title}: ${cars.join('. ')}.`
        : `You haven’t been put in a car for ${title} yet.`
    }
    case 'lodging': {
      if (!ev.lodging) return `${title} has no lodging.`
      const rooms = lodgingFor(ev, viewer, names)
      return rooms.length
        ? `${title}: ${rooms.join('. ')}.`
        : `You haven’t been given a room for ${title} yet.`
    }
    case 'weather':
      // Fetched, then said by weatherLine.
      return ''
    case 'flight': {
      if (!ev.flights) return `${title} has no flights.`
      const flights = flightsFor(ev, viewer, names)
      return flights.length
        ? `${title}: ${flights.join(' ')}`
        : `You have no flight for ${title} yet.`
    }
  }
}

/** The answer, worked out here, or null to ask Claude. */
export function quickAnswer(text: string, data: QuickData): QuickAnswer | null {
  if (!data.templates.length) return null
  const ask = quickAsked(text, data.today)
  if (!ask) return null
  const events = eventsFor(ask, data)
  // Nothing found, or more than can be said in a breath: Claude works it out.
  if (events.length === 0 || events.length > 3) return null
  if (ask.field === 'weather') {
    return {
      text: '',
      open: events.length === 1 ? { key: events[0].instanceKey, section: 'weather' } : null,
      weather: events,
    }
  }
  if (events.length === 1) {
    const ev = events[0]
    return {
      text: answerFor(ask.field, ev, data, true),
      open: { key: ev.instanceKey, section: ask.field === 'dress' ? 'dress_code' : 'details' },
    }
  }
  return {
    text: events.map((ev) => answerFor(ask.field, ev, data, false)).join(' '),
    open: null,
  }
}

/** Ways a screen is asked for, by its id in lib/miriamScreens. */
const SCREEN_WORDS: Record<string, string[]> = {
  dashboard: ['dashboard', 'home screen'],
  home: ['home'],
  events: ['events', 'calendar', 'event calendar'],
  events_map: ['events map', 'map'],
  assignments: ['assignments', 'tasks', 'my tasks', 'to do list'],
  announce: ['announcements'],
  messages: ['messages', 'chat', 'my messages', 'inbox'],
  issues: ['operations', 'issues'],
  kaizen: ['kaizen'],
  planning: ['planning', 'planning boards'],
  ops_inventory: ['inventory', 'reorder list'],
  security: ['security'],
  worship: ['worship', 'set lists', 'chord sheets'],
  music: ['content', 'music', 'sermons', 'podcasts'],
  public: ['public facing', 'public pages'],
  settings: ['settings', 'profile', 'my profile', 'notifications', 'notification settings'],
  blocked: ['blocked people', 'blocked users'],
  admin: ['admin', 'admin panel'],
  admin_users: ['user management', 'users'],
  admin_avail: ['availability'],
  admin_groups: ['groups'],
  admin_teams: ['common teams', 'teams'],
  admin_templates: ['task templates', 'templates'],
  admin_audit: ['audit trail', 'audit log'],
  admin_theme: ['theme'],
}

/**
 * A screen asked for by name — "open settings", "go to messages", "take me to
 * the admin panel" — among those this person has (`screens`): its id, or
 * null. Only a screen's own name: "open Above All" is a song, not a screen.
 */
export function screenAsked(text: string, screens: { id: string; label: string }[]): string | null {
  const m = text
    .toLowerCase()
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(?:(?:hey|ok|okay)\s+)?(?:miriam\s+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/,
      ''
    )
    .match(
      /^(?:open|go\s+to|take\s+me\s+to|show\s+me|bring\s+up|pull\s+up)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:tab|page|screen|section))?(?:\s+please)?$/
    )
  if (!m) return null
  const asked = m[1].trim()
  const ids = new Set(screens.map((s) => s.id))
  for (const [id, words] of Object.entries(SCREEN_WORDS)) {
    if (ids.has(id) && words.includes(asked)) return id
  }
  // By the label it is listed under: "Profile & Settings".
  const byLabel = screens.find((s) => s.label.toLowerCase() === asked)
  return byLabel?.id ?? null
}

/** A forecast, as said for one event; `forecast` null when there is none to be had. */
export function weatherLine(
  ev: EventInstance,
  forecast: { high: number; low: number; precipPct: number; label: string } | null,
  today: string
): string {
  const when = whenSaid(ev.date, today)
  if (ev.isVirtual) return `${ev.title} is virtual — no weather to give.`
  if (typeof ev._geocodeLat !== 'number' || typeof ev._geocodeLng !== 'number') {
    return `${ev.title} has no forecast: no place is set for it.`
  }
  if (!forecast) return `There’s no forecast yet for ${ev.title} ${when}.`
  const rain = forecast.precipPct >= 20 ? `, ${forecast.precipPct}% chance of rain` : ''
  return `${ev.title} ${when}: ${forecast.label.toLowerCase()}, high ${Math.round(forecast.high)}°, low ${Math.round(forecast.low)}°${rain}.`
}

// --- What's coming up ------------------------------------------------------

/** Lowered, punctuation off: as the parsers below read what was said. */
const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(?:(?:hey|ok|okay)\s+)?(?:miriam\s+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/,
      ''
    )

export interface ListAsk {
  /** Just the next one. */
  next: boolean
  from: string
  to: string
  /** Said as a span: "this week". */
  span: string
}

/** "What's my next event?", "what's on this week?", "what do I have tomorrow?" */
export function listAsked(text: string, today: string): ListAsk | null {
  const said = clean(text)
  if (
    /\b(?:my\s+)?next\s+event\b|^what'?s\s+next\b|\bwhat(?:'s|\s+is)\s+coming\s+up\b|\bwhat\s+do\s+i\s+have\s+(?:coming\s+up|next)\b/.test(
      said
    )
  ) {
    return { next: true, from: today, to: shiftDate(today, 365), span: '' }
  }
  const asksEvents =
    /\b(?:what'?s\s+on|what(?:'s|\s+is)\s+happening|what\s+do\s+i\s+have|what\s+events|any\s+events|my\s+events|my\s+schedule|what'?s\s+(?:going\s+on|planned))\b/.test(
      said
    )
  if (!asksEvents) return null
  const day = new Date(`${today}T12:00:00`).getDay()
  if (/\btoday\b|\btonight\b/.test(said))
    return { next: false, from: today, to: today, span: 'today' }
  if (/\btomorrow\b/.test(said)) {
    const t = shiftDate(today, 1)
    return { next: false, from: t, to: t, span: 'tomorrow' }
  }
  if (/\bthis\s+weekend\b/.test(said)) {
    const sat = shiftDate(today, (6 - day + 7) % 7)
    return {
      next: false,
      from: day === 0 ? today : sat,
      to: day === 0 ? today : shiftDate(sat, 1),
      span: 'this weekend',
    }
  }
  if (/\bnext\s+week\b/.test(said)) {
    const sun = shiftDate(today, 7 - day)
    return { next: false, from: sun, to: shiftDate(sun, 6), span: 'next week' }
  }
  if (/\bthis\s+month\b/.test(said)) {
    const last = new Date(`${today}T12:00:00`)
    last.setMonth(last.getMonth() + 1, 0)
    return { next: false, from: today, to: last.toISOString().slice(0, 10), span: 'this month' }
  }
  // "This week", or no span at all: the rest of this week.
  return { next: false, from: today, to: shiftDate(today, 6 - day), span: 'this week' }
}

/** When, short: "today at 5 PM", "Friday", "Sunday, Oct 18". */
function whenShort(ev: EventInstance, today: string): string {
  const day =
    ev.date === today
      ? 'today'
      : ev.date === shiftDate(today, 1)
        ? 'tomorrow'
        : new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'long',
            ...(ev.date > shiftDate(today, 6) ? { month: 'short', day: 'numeric' } : {}),
          })
  return ev.startTime ? `${day} at ${ev.startTime}` : day
}

/** The events this person can see between two dates, theirs before the rest, by date. */
function eventsBetween(data: QuickData, from: string, to: string): EventInstance[] {
  const { templates, overrides, groups, viewer } = data
  return templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, from, to, overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function listAnswer(ask: ListAsk, data: QuickData): QuickAnswer {
  const { viewer, groups, today } = data
  const all = eventsBetween(data, ask.from, ask.to)
  const mine = all.filter((ev) => assignedTo(ev, groups).has(viewer.uid))
  if (ask.next) {
    const ev = mine[0] ?? all[0]
    if (!ev) return { text: 'You have nothing coming up.', open: null }
    return {
      text: `Your next event is ${ev.title}, ${whenShort(ev, today)}.`,
      open: { key: ev.instanceKey, section: 'details' },
    }
  }
  if (all.length === 0) return { text: `Nothing is on ${ask.span}.`, open: null }
  const shown = all.slice(0, 5).map((ev) => `${ev.title}, ${whenShort(ev, today)}`)
  const more = all.length > 5 ? `; and ${all.length - 5} more` : ''
  return { text: `On ${ask.span}: ${shown.join('; ')}${more}.`, open: null }
}

// --- Your tasks --------------------------------------------------------------

export type TasksAsk = 'open' | 'today' | 'week' | 'overdue'

/** "What are my tasks?", "what's due this week?", "anything overdue?" */
export function tasksAsked(text: string): TasksAsk | null {
  const said = clean(text)
  const asks =
    /\b(?:my\s+tasks|any\s+tasks|what\s+tasks|what(?:'s|\s+is)\s+due|what\s+do\s+i\s+(?:need|have)\s+to\s+do|my\s+to\s*do|overdue|what(?:'s|\s+is)\s+on\s+my\s+(?:plate|list))\b/.test(
      said
    )
  if (!asks || /\b(?:everyone|everybody|all\s+tasks|team'?s|their)\b/.test(said)) return null
  if (/\boverdue\b|\blate\b|\bbehind\b/.test(said)) return 'overdue'
  if (/\btoday\b|\btonight\b/.test(said)) return 'today'
  if (/\bthis\s+week\b/.test(said)) return 'week'
  return 'open'
}

export interface TaskLike {
  id: string | number
  title: string
  status: string
  dueDate?: string | null
  assignees: (string | number)[]
  lead?: string | number | null
}

export function tasksAnswer(
  ask: TasksAsk,
  tasks: TaskLike[],
  uid: string,
  today: string
): QuickAnswer {
  const day = new Date(`${today}T12:00:00`).getDay()
  const weekEnd = shiftDate(today, 6 - day)
  const mine = tasks
    .filter((t) => t.status !== 'done')
    .filter((t) => t.assignees.some((a) => sameId(a, uid)) || sameId(t.lead ?? '', uid))
    .filter((t) =>
      ask === 'overdue'
        ? !!t.dueDate && t.dueDate < today
        : ask === 'today'
          ? t.dueDate === today
          : ask === 'week'
            ? !!t.dueDate && t.dueDate <= weekEnd
            : true
    )
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const span = { open: '', today: ' due today', week: ' due this week', overdue: ' overdue' }[ask]
  if (mine.length === 0) {
    return {
      text: ask === 'open' ? 'You have no open tasks.' : `Nothing of yours is${span}.`,
      open: null,
    }
  }
  const due = (t: TaskLike) => {
    if (!t.dueDate) return ''
    if (t.dueDate < today) return ' (overdue)'
    if (t.dueDate === today) return ' (due today)'
    const d = new Date(`${t.dueDate}T12:00:00`)
    return ` (due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`
  }
  const shown = mine.slice(0, 5).map((t) => `${t.title}${due(t)}`)
  const more = mine.length > 5 ? `; and ${mine.length - 5} more` : ''
  const count = `${mine.length} ${mine.length === 1 ? 'task' : 'tasks'}${span}`
  return { text: `You have ${count}: ${shown.join('; ')}${more}.`, open: null }
}

// --- Playing something from Content -------------------------------------------

export interface PlayAsk {
  kind: 'sermon' | 'podcast' | 'music' | null
  /** The newest of that kind, asked for as such. */
  latest: boolean
  /** The words naming it, if any. */
  query: string
  /** As said, for a title: "revive me". */
  title: string
}

const PLAY_WORDS = new Set([
  'the',
  'a',
  'an',
  'latest',
  'last',
  'newest',
  'new',
  'recent',
  'most',
  'from',
  'on',
  'this',
  'past',
  'week',
  'weeks',
  'sunday',
  'sundays',
  'sunday’s',
  "sunday's",
  'service',
  'message',
  'sermon',
  'podcast',
  'episode',
  'song',
  'music',
  'video',
  'me',
  'please',
  'some',
  'by',
  'of',
])

/**
 * A video from Content asked for: "play Revive Me", "watch the sermon from
 * Sunday", "play the latest podcast", "open the Revive Me video". "Play" is
 * always for Content; a chord sheet is opened ("open Revive Me"), and "play
 * Above All next" queues one on an open sheet (lib/sheetCommands).
 */
export function playAsked(text: string): PlayAsk | null {
  const said = clean(text)
  let rest = said.match(/^(?:play|watch|listen\s+to|put\s+on)\s+(.+)$/)?.[1]
  if (!rest) {
    // Opened, as a video: "open the Revive Me video", "pull up the latest sermon".
    const m = said.match(
      /^(?:open|show(?:\s+me)?|pull\s+up|bring\s+up|put\s+up|start|load|find|get)\s+(.+)$/
    )
    if (m && /\b(?:videos?|sermon|podcast|episode)\b/.test(m[1])) rest = m[1]
  }
  if (!rest) return null
  // "Play next Above All", "play Above All next": queued on an open sheet.
  if (/^next\b|\bnext$/.test(rest)) return null
  const kind = /\b(?:sermon|message|preaching)\b/.test(rest)
    ? 'sermon'
    : /\b(?:podcast|episode)\b/.test(rest)
      ? 'podcast'
      : null
  const latest =
    /\b(?:latest|last|newest|recent|from\s+(?:this\s+)?sunday|sunday'?s|this\s+(?:past\s+)?(?:week|sunday))\b/.test(
      rest
    )
  const query = rest
    .split(' ')
    .filter((w) => !PLAY_WORDS.has(w))
    .join(' ')
    .trim()
  const title = rest
    .replace(/\b(?:music\s+)?videos?\b/g, ' ')
    .replace(/\s+(?:on|from|in)\s+content\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:the|a)\s+/, '')
  return { kind, latest, query, title }
}

export interface PlayItem {
  id: string
  type: string
  title: string
  album?: string
  preacher?: string
  host?: string
  guest?: string
  year?: number
  month?: number
}

/** The one item asked for, or null when it isn't plain which. */
export function playPick<T extends PlayItem>(ask: PlayAsk, items: T[]): T | null {
  const newest = (a: T, b: T) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0)
  let pool = items.filter((m) => !ask.kind || m.type === ask.kind)
  if (ask.title) {
    // Its title, as said: "Revive Me" — not "Revive Us Again".
    const said = titleWords(ask.title)
    const exact = pool.filter((m) => titleWords(m.title) === said)
    if (exact.length) return [...exact].sort(newest)[0]
    // Every word said, in one title only: "Revive Me" for "Revive Me (Live)".
    const words = said.split(' ')
    const within = pool.filter((m) => {
      const have = titleWords(m.title).split(' ')
      return words.every((w) => have.includes(w))
    })
    if (within.length === 1) return within[0]
  }
  if (ask.query) {
    pool = pool.filter((m) =>
      fitsWords(
        [m.title, m.album, m.preacher, m.host, m.guest].filter(Boolean).join(' '),
        ask.query
      )
    )
  }
  if (pool.length === 0) return null
  if (ask.latest || pool.length === 1) return [...pool].sort(newest)[0]
  return null
}

/** A title's words, lowered, without punctuation: "10,000 Reasons" as "10000 reasons". */
const titleWords = (title: string) =>
  title
    .toLowerCase()
    .replace(/[’',]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const fitsWords = (text: string, query: string) => {
  const have = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return query
    .split(' ')
    .filter(Boolean)
    .every((q) => have.some((w) => w.startsWith(q) || q.startsWith(w)))
}

// --- Answering availability ---------------------------------------------------

export interface AvailAsk {
  status: 'yes' | 'no' | 'partial' | 'tbd'
  date: string | null
  name: string
}

const AVAIL_WORDS = new Set([
  "i'm",
  'i’m',
  'im',
  'i',
  'am',
  'will',
  'be',
  "i'll",
  'i’ll',
  'available',
  'unavailable',
  'not',
  'can',
  "can't",
  'can’t',
  'cannot',
  'make',
  'it',
  'come',
  'there',
  'count',
  'me',
  'in',
  'out',
  'put',
  'down',
  'as',
  'mark',
  'sure',
  'maybe',
  'partly',
  'partially',
  'part',
  'of',
  'for',
  'to',
  'the',
  'won’t',
  "won't",
  'able',
  'might',
  'tbd',
  'yes',
  'no',
  'going',
  'attend',
])

/** "I'm available for Revival", "I can't make it Friday", "not sure about the banquet". */
export function availabilityAsked(text: string, today: string): AvailAsk | null {
  const said = clean(text)
  if (text.includes('?') || /^(?:am|is|are|who|what|when|which)\b/.test(said)) return null
  if (!/^(?:i\b|i'm|im\b|i'll|put\s+me|mark\s+me|count\s+me|not\s+sure|maybe)/.test(said))
    return null
  const status: AvailAsk['status'] | null =
    /\bnot\s+sure\b|\bmaybe\b|\btbd\b|\bmight\s+(?:make\s+it|come|be)\b/.test(said)
      ? 'tbd'
      : /\bpart(?:ly|ially)?\s+available\b|\bpart\s+of\s+(?:it|the)\b/.test(said)
        ? 'partial'
        : /\bnot\s+available\b|\bunavailable\b|\bcan(?:'t|not)\s+(?:make\s+it|come|be\s+there|go|attend)\b|\bwon't\s+(?:be\s+(?:there|able)|make\s+it)\b|\bcount\s+me\s+out\b/.test(
              said
            )
          ? 'no'
          : /\bavailable\b|\bcan\s+(?:make\s+it|come|be\s+there|go|attend)\b|\bwill\s+be\s+there\b|\bi'll\s+be\s+there\b|\bcount\s+me\s+in\b/.test(
                said
              )
            ? 'yes'
            : null
  if (!status) return null
  const ref = eventRef(said.replace(/'/g, '’'), today, AVAIL_WORDS)
  if (!ref) return null
  return { status, ...ref }
}

/** The one event an availability answer is for, or null when it isn't plain which. */
export function availabilityEvent(ask: AvailAsk, data: QuickData): EventInstance | null {
  const events = eventsFor({ field: 'time', date: ask.date, name: ask.name }, data).filter(
    (ev) => ev.date >= data.today
  )
  return events.length === 1 ? events[0] : null
}
