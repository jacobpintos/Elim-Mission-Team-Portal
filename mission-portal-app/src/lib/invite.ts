import { allInstances } from '@/lib/events'
import type { EventInstance, EventTemplate } from '@/types/events'

/**
 * "Invite a friend" on Connect (features/page-builder InviteFriend): an
 * invitation to the next Sunday service, written out for a text, an email or
 * a Facebook post — with its time and place as the calendar has them for that
 * day, since it isn't always at the same venue.
 */

/** The church's site, and Elim's pages, as the invitation links them. */
export const THE_WELL_SITE = 'https://thewellofiowa.com'
export const ELIM_FACEBOOK = 'https://www.facebook.com/share/1EE9JBSnjC/'
export const ELIM_YOUTUBE = 'https://youtube.com/theelimarrival'

export interface InviteLinks {
  site: string
  facebook: string
  youtube: string
}

/** The service invited to: its day, time and where — as that day's calendar entry has them. */
export interface NextService {
  /** Its date's key (`<templateId>_<YYYY-MM-DD>`): the event page's, and what an invite is counted against. */
  key: string
  title: string
  date: string
  startTime: string | null
  /** "The Midnight Gem, 120 SW 5th St, Des Moines, IA"; null online or unsaid. */
  place: string | null
  online: boolean
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}
const isSunday = (date: string) => new Date(`${date}T12:00:00`).getDay() === 0

/** "10:00 AM" → minutes past midnight; null when it isn't a time. */
function minutes(time: string | undefined): number | null {
  const m = (time ?? '').match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (!m) return null
  return ((Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m[2] ?? 0)
}

/** Where it is, from the day's own entry: its venue, street, and town — each once. */
export function placeOf(
  ev: Pick<EventInstance, 'location' | 'address' | 'city' | 'state'>
): string | null {
  const town = [ev.city, ev.state].filter(Boolean).join(', ')
  const parts: string[] = []
  for (const part of [ev.location, ev.address, town]) {
    const p = (part ?? '').trim()
    if (!p) continue
    // "123 Main St, Des Moines, IA" already says the town.
    if (parts.some((q) => q.toLowerCase().includes(p.toLowerCase()))) continue
    parts.push(p)
  }
  return parts.length ? parts.join(', ') : null
}

/**
 * The next Sunday service on the calendar, from now: "Sunday Service" by
 * name, a public one before any other; else a public service, gathering or
 * worship on a Sunday. One already begun today is past — the next week's is
 * the one to invite to. Null when the calendar has none in the next six weeks.
 */
export function nextSundayService(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  now: Date = new Date()
): NextService | null {
  const today = localDate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const sundays = allInstances(templates, overrides, today, addDays(today, 42)).filter((ev) => {
    if ((ev as { unpublished?: boolean }).unpublished === true) return false
    if (!isSunday(ev.date)) return false
    if (ev.date !== today) return true
    const start = minutes(ev.startTime)
    return start === null || start > nowMinutes
  })
  const named = (ev: EventInstance) => /\bsunday\s+service\b/i.test(ev.title)
  const service = (ev: EventInstance) => /\b(?:service|gathering|worship|church)\b/i.test(ev.title)
  const ev =
    sundays.find((e) => named(e) && e.isPublic === true) ??
    sundays.find(named) ??
    sundays.find((e) => service(e) && e.isPublic === true) ??
    null
  if (!ev) return null
  return {
    key: ev.instanceKey,
    title: ev.title,
    date: ev.date,
    startTime: ev.startTime?.trim() || null,
    place: ev.isVirtual ? null : placeOf(ev),
    online: ev.isVirtual === true,
  }
}

/** The day as said: "today", "this Sunday, November 8", "Saturday, November 21". */
function whenSaid(date: string, now: Date): string {
  const today = localDate(now)
  if (date === today) return 'today'
  const d = new Date(`${date}T12:00:00`)
  const md = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  return date <= addDays(today, 6) ? `this ${weekday}, ${md}` : `${weekday}, ${md}`
}

/** The invitation: a subject for an email, and the message itself. */
export function inviteMessage(
  service: NextService | null,
  links: InviteLinks,
  now: Date = new Date()
): { subject: string; body: string } {
  const learn = [
    'Get to know us before you come:',
    `The Well: ${links.site}`,
    `Elim on Facebook: ${links.facebook}`,
    `Elim on YouTube: ${links.youtube}`,
  ].join('\n')
  if (!service) {
    return {
      subject: 'Join me at church on Sunday',
      body: `Hi! I’d love for you to come to church with me one Sunday. When and where we meet is at ${links.site}.\n\n${learn}\n\nHope to see you there!`,
    }
  }
  const when = whenSaid(service.date, now)
  const time = service.startTime ? ` at ${service.startTime}` : ''
  const where = service.online
    ? ' It’s online this time.'
    : service.place
      ? ` We’ll be at ${service.place}.`
      : ''
  return {
    subject:
      when === 'today'
        ? 'Join me at church today'
        : when.startsWith('this')
          ? 'Join me at church this Sunday'
          : 'Join me at church on Sunday',
    body: `Hi! I’d love for you to come to church with me ${when}${time}.${where}\n\n${learn}\n\nHope to see you there!`,
  }
}

/** A public event invited to, from its page or its card. */
export interface InvitedEvent {
  title: string
  date: string
  startTime?: string | null
  location?: string
  address?: string
  city?: string
  state?: string
  isVirtual?: boolean
  facebookUrl?: string
}

/**
 * An invitation to a public event: its day, time and place as its date has
 * them, and its page in the app (pageUrl) — and its Facebook event, where it
 * has one — to see the rest.
 */
export function eventInviteMessage(
  ev: InvitedEvent,
  pageUrl: string,
  now: Date = new Date()
): { subject: string; body: string } {
  const when = whenSaid(ev.date, now)
  const time = ev.startTime?.trim() ? ` at ${ev.startTime.trim()}` : ''
  const place = ev.isVirtual ? null : placeOf(ev)
  const where = ev.isVirtual ? ' It’s online.' : place ? ` It’s at ${place}.` : ''
  const facebook = ev.facebookUrl?.trim()
  return {
    subject: `Join me at ${ev.title}`,
    body: [
      `Hi! I’d love for you to come to ${ev.title} with me ${when}${time}.${where}`,
      '',
      `All the details: ${pageUrl}`,
      ...(facebook ? [`On Facebook: ${facebook}`] : []),
      '',
      'Hope to see you there!',
    ].join('\n'),
  }
}

/**
 * A public event's page for anyone it's sent to — no account needed
 * (app/(public)/invite/[key]), at the app's address.
 */
export const eventPageUrl = (origin: string, key: string) =>
  `${origin.replace(/\/+$/, '')}/invite/${encodeURIComponent(key)}`

/** A text with the message written in: the Messages app, or the phone's own. */
export const smsUrl = (body: string) => `sms:?&body=${encodeURIComponent(body)}`
/** An email with the subject and message written in. */
export const mailUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
/**
 * Facebook's share of a link. Facebook takes no words from another app — not
 * for a post, nor a message — so the invitation is copied to be pasted in.
 */
export const facebookShareUrl = (link: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`
