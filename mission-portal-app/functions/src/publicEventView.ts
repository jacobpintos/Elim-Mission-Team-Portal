import { instancesOf, type EventTemplate } from './miriam/data'

/**
 * What anyone may see of a public event — no account needed: what an
 * invitation links to (the app's /invite/<key>, app/(public)/invite/[key]).
 * Its date's own name, time and place, what it says about itself, its photo
 * and its Facebook event. Nothing of who is on it or the team's side, and
 * nothing at all of an event — or a date of one — that isn't public.
 *
 * Kept free of Firebase: the app's tests import it.
 */
export interface PublicEventView {
  key: string
  title: string
  date: string
  startTime: string
  location: string
  address: string
  city: string
  state: string
  isVirtual: boolean
  virtualLink: string
  description: string
  facebookUrl: string
  coverImage: string
}

/** `<templateId>_<YYYY-MM-DD>`, or an extra day's `…_d2`: its event and date. */
export function keyParts(key: string): { id: string; date: string } | null {
  const m = /^(.+?)_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(key)
  return m ? { id: m[1], date: m[2] } : null
}

const text = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** The view of one date of an event (its document as stored), or null when it isn't public. */
export function publicEventView(
  doc: Record<string, unknown>,
  id: string,
  key: string
): PublicEventView | null {
  const parts = keyParts(key)
  if (!parts || parts.id !== id) return null
  if (doc.unpublished === true || doc.deleted === true) return null
  const { overrides, ...tmpl } = doc as { overrides?: Record<string, Partial<EventTemplate>> }
  const ev = instancesOf(
    { ...(tmpl as unknown as EventTemplate), id },
    parts.date,
    parts.date,
    overrides ?? {}
  ).find((i) => i.instanceKey === key)
  if (!ev || ev.isPublic !== true) return null
  const e = ev as unknown as Record<string, unknown>
  return {
    key,
    title: text(e.title, 200),
    date: ev.date,
    startTime: text(e.startTime, 40),
    location: text(e.location, 200),
    address: text(e.address, 200),
    city: text(e.city, 100),
    state: text(e.state, 40),
    isVirtual: e.isVirtual === true,
    virtualLink: e.isVirtual === true ? text(e.virtualLink, 500) : '',
    description: text(e.description),
    facebookUrl: text(e.facebookUrl, 500),
    coverImage: text(e.coverImage, 1000),
  }
}
