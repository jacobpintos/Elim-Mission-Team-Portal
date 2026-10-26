import {
  canSeeEvent,
  instancesOf,
  shiftDate,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Viewer,
} from '../../functions/src/miriam/data'

/**
 * "When is Elim coming to my area?", "is Elim coming to Des Moines?", "any
 * events near me?" — asked by someone following the church in the app: the
 * public events within the distance they set, or in and around the city they
 * name, by date. None: nothing upcoming there at the moment, and the
 * leadership team can be asked to bring Elim there.
 *
 * Pure, so it can be tested: the events, where they are, and the place asked
 * about (found on the map by the caller) are handed in.
 */

export type ComingAsk = { near: true } | { near: false; place: string }

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Who's coming: Elim, "you", the team or the tour. */
const WHO =
  /\b(?:elim|you(?:\s+(?:guys|all))?|y'?all|the\s+(?:team|tour|band|ministry|church|well|elim\s+team)|your\s+(?:team|tour|church|ministry))\b/

/** "Coming to", "be in", "stopping near", "headed through". */
const COMING =
  /\b(?:coming|come|be|stopping|stop|visiting|visit|headed|heading|going|touring|doing\s+(?:an?\s+)?(?:event|events|anything|something))\s+(?:back\s+)?(?:to|in|near|by|around|through|close\s+to)\s+(.+)$/

/** "Events near me", "anything in Des Moines", "what's happening around here". */
const EVENTS_AT =
  /\b(?:events?|anything|something|what'?s\s+(?:happening|going\s+on|on|coming\s+up))\s+(?:coming\s+up\s+)?(?:near|around|in|by|close\s+to)\s+(.+)$/

/** Said for where they are. */
const HERE =
  /^(?:me|us|here|around\s+here|nearby|this\s+area|our\s+area|town|my\s+(?:area|city|town|neighborhood|neck\s+of\s+the\s+woods|state|region|location)|where\s+i\s+(?:live|am))$/

/** Said after the place, and not part of it. */
const AFTER_PLACE =
  /\s+(?:any\s*time\s+soon|soon|again|next|this\s+(?:year|month|summer|fall|spring|winter)|next\s+(?:year|month)|at\s+all|ever|please)$/

export function comingAsked(text: string): ComingAsk | null {
  const t = clean(text)
  const coming = WHO.test(t) ? COMING.exec(t) : null
  const at = coming ?? EVENTS_AT.exec(t)
  if (!at) return null
  let place = at[1].trim()
  for (let i = 0; i < 3; i++) place = place.replace(AFTER_PLACE, '').trim()
  if (!place) return null
  if (HERE.test(place)) return { near: true }
  // Not a place by its look: "anything in the store", "events on my calendar".
  if (/^(?:the|my|our|your|a|an|this|that)\b/.test(place)) return null
  return { near: false, place }
}

/** Where to look, and how far out: theirs, or a city's. */
export interface Spot {
  lat: number
  lng: number
  miles: number
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 0.621371
}

/**
 * The events there, each once at its next date: in person, within `spot`'s
 * distance, or — for a city named — in that city by name. `events` in date
 * order, as they may see them.
 */
export function eventsThere(
  events: EventInstance[],
  spot: Spot | null,
  city?: { city: string; state: string }
): EventInstance[] {
  const seen = new Set<string>()
  const named = city?.city.trim().toLowerCase()
  return events.filter((ev) => {
    if (ev.isVirtual) return false
    const near =
      !!spot &&
      typeof ev._geocodeLat === 'number' &&
      typeof ev._geocodeLng === 'number' &&
      milesBetween(spot, { lat: ev._geocodeLat, lng: ev._geocodeLng }) <= spot.miles
    const inCity =
      !!named &&
      (ev.city ?? '').trim().toLowerCase() === named &&
      (!city?.state || !ev.state || ev.state.trim().toLowerCase() === city.state.toLowerCase())
    if (!near && !inCity) return false
    const key = String(ev.templateId ?? ev.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const daySaid = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

function oneSaid(ev: EventInstance): string {
  const at = ev.startTime ? ` at ${ev.startTime}` : ''
  const where = [ev.location, ev.city].filter(Boolean).join(', ')
  const place = where ? `, ${where}` : ''
  if (!ev.isRec) return `${ev.title} on ${daySaid(ev.date)}${at}${place}`
  const often =
    ev.recur === 'biweekly'
      ? 'every other week'
      : ev.recur === 'monthly'
        ? 'every month'
        : 'every week'
  return `${ev.title}, ${often} — next on ${daySaid(ev.date)}${at}${place}`
}

/** How many are read out; the rest are on the Events calendar. */
const SAID = 4

/**
 * Said of what was found: `where` is "near you" or "in Des Moines". None
 * found: nothing upcoming there at the moment, and who can be asked.
 */
export function comingSaid(found: EventInstance[], where: string): string {
  if (!found.length) {
    return `There’s nothing upcoming ${where} at the moment — but you can contact our leadership team to ask for Elim to come. Here’s the form to reach them.`
  }
  const said = found.slice(0, SAID).map(oneSaid).join('; ')
  const more = found.length > SAID ? ` And ${found.length - SAID} more on the Events calendar.` : ''
  return `Coming up ${where}: ${said}.${more}`
}

/** How far ahead "coming" looks. */
const AHEAD_DAYS = 365

/** The events this person can see, coming up within the year, by date. */
export function upcomingSeen(data: {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  groups: Group[]
  viewer: Viewer
  today: string
}): EventInstance[] {
  const { templates, overrides, groups, viewer, today } = data
  return templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, today, shiftDate(today, AHEAD_DAYS), overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}
