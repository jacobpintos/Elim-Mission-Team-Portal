/**
 * How long an event's history is kept (./cleanup dailyCleanup, ./onEventDeleted).
 *
 * - An event is kept for 12 months after its last date — a one-off event's
 *   last day, a repeating one's end (recEnd) — then deleted, and everything
 *   of it with it (./onEventDeleted). A repeating event with no end is kept.
 * - Of a repeating event still going, the availability answers and food
 *   sign-ups of its dates more than 12 months past are cleared.
 * - An invitation's record (lib/inviteLog) is kept 90 days past its date.
 *
 * The nightly backups (./backups) keep 30 days, so whatever goes can be had
 * back for a month.
 *
 * Kept free of Firebase: the app's tests import it.
 */
export const KEEP_EVENT_MONTHS = 12
export const KEEP_INVITE_DAYS = 90

const pad = (n: number) => String(n).padStart(2, '0')

/** Today in Iowa, where the church's days are, as YYYY-MM-DD. */
export function iowaToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

/** The day this many months before `today` (the 31st going back to a shorter month: its last day). */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number)
  const total = y * 12 + (m - 1) - months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`
}

/** The day this many days before `today`. */
export function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

type EventDoc = {
  isRec?: boolean
  date?: string
  recEnd?: string | null
  extraDays?: { date?: string }[]
}

/**
 * An event's last day: a one-off's last date (its extra days counted), a
 * repeating one's end. Null for one that repeats with no end, or has no date
 * yet (a draft) — neither is ever past.
 */
export function lastDayOf(ev: EventDoc): string | null {
  const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (ev.isRec) return isDay(ev.recEnd) ? ev.recEnd : null
  const days = [ev.date, ...(ev.extraDays ?? []).map((d) => d?.date)].filter(isDay)
  return days.length ? days.sort()[days.length - 1] : null
}

/** Past keeping: its last day before the cutoff. */
export const pastKeeping = (ev: EventDoc, cutoff: string): boolean => {
  const last = lastDayOf(ev)
  return last !== null && last < cutoff
}

/** A Storage download address's path ("pages/event-covers/…"), or null when it isn't one. */
export function storagePathOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/.exec(url)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

/** Where an admin's cover photos are uploaded (src/features/events/EventFormModal). */
export const COVER_FOLDER = 'pages/event-covers/'

/** An event's cover photos: its own, and any a date of it was given. */
export function coverUrlsOf(doc: Record<string, unknown> | undefined): string[] {
  if (!doc) return []
  const overrides = (doc.overrides ?? {}) as Record<string, { coverImage?: unknown }>
  const all = [doc.coverImage, ...Object.values(overrides).map((o) => o?.coverImage)]
  return [...new Set(all.filter((u): u is string => typeof u === 'string' && !!u))]
}

/**
 * The folders its flight and hotel pictures are in (src/lib/travelImageUpload:
 * eventFlights/<entry>/, eventLodging/<entry>/), from its private record —
 * its own entries, and any a date of it has.
 */
export function travelFoldersOf(privateDoc: Record<string, unknown> | undefined): string[] {
  if (!privateDoc) return []
  const parts = [
    privateDoc,
    ...Object.values((privateDoc.overrides ?? {}) as Record<string, Record<string, unknown>>),
  ]
  const folders = new Set<string>()
  const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_')
  for (const part of parts) {
    for (const e of (part?.flightEntries ?? []) as { id?: unknown }[]) {
      if (typeof e?.id === 'string' && e.id) folders.add(`eventFlights/${safe(e.id)}/`)
    }
    for (const e of (part?.lodgingEntries ?? []) as { id?: unknown }[]) {
      if (typeof e?.id === 'string' && e.id) folders.add(`eventLodging/${safe(e.id)}/`)
    }
  }
  return [...folders]
}
