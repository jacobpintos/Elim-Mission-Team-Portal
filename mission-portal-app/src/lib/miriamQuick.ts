import {
  carpoolFor,
  dressCodeFor,
  findEvents,
  flightsFor,
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

export type QuickField = 'dress' | 'time' | 'place' | 'team' | 'car' | 'lodging' | 'flight'

export interface QuickAsk {
  field: QuickField
  /** The day asked about (YYYY-MM-DD), if one was. */
  date: string | null
  /** The words naming the event, if any: "revival", "sunday service". */
  name: string
}

const FIELDS: [QuickField, RegExp][] = [
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
  /\b(?:everyone|everybody|who\s+(?:is|isn't|is\s+not)\s+(?:available|coming|going)|availab|unavailable|report\s+time|call\s+time|weather|rain|forecast|food|bring|task|due|all\s+(?:the\s+)?events|this\s+week|next\s+week|this\s+month)\b/

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
    .filter((w) => !ASKING.has(w))
    .join(' ')
    .trim()
  const sundayService = /\bsunday\s+service\b/.test(plain)
  if (!date && !name && !sundayService) return null
  return { field, date, name: sundayService ? `sunday service ${name}`.trim() : name }
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
  open: { key: string; section: 'dress_code' | 'details' } | null
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
