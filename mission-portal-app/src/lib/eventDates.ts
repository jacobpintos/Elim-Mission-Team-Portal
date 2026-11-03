import type { ExtraDay } from '@/types/events'
import { tidyTime } from './eventSchedule'

/**
 * Dates as the event form shows them, and as they are stored.
 *
 * The form takes MM/DD/YY because that is what people type; Firestore holds
 * ISO because that is what sorts and compares. These two functions are the
 * only place that boundary is crossed, and they live here rather than inside
 * the form so the parsing can be tested without mounting a modal.
 */
export function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return iso
  const [, y, m, d] = match
  return `${m}/${d}/${y.slice(2)}`
}

/**
 * `upcomingFrom` (YYYY-MM-DD, today): a date with no year — "11/20" — is
 * the next one: this year's, unless it has passed, then next year's. For a
 * date still to come — an event, an expiry. Without it, a date needs its
 * year: an expense's date has been, not to come.
 */
export function displayToIso(display: string, opts: { upcomingFrom?: string } = {}): string {
  if (!display) return ''
  const match = display.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!match) return ''
  const [, m, d, y] = match
  const mn = Number(m),
    dn = Number(d)
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return ''
  const md = `${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  if (!y) {
    const from = opts.upcomingFrom
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return ''
    const year = Number(from.slice(0, 4))
    return `${md < from.slice(5) ? year + 1 : year}-${md}`
  }
  const fullYear = y.length <= 2 ? `20${y.padStart(2, '0')}` : y
  return `${fullYear}-${md}`
}

/**
 * An extra day while it is being edited.
 *
 * Holds the date the way the field shows it (MM/DD/YY) rather than the way it
 * is stored (ISO), exactly like form.date does — one conversion, at save, in
 * one direction each way. The id is local and never saved; it only keeps React
 * keys stable while rows are added and removed.
 */
export interface ExtraDayRow {
  id: string
  date: string
  startTime: string
  location: string
}

export function toExtraDayRows(days: ExtraDay[] | undefined): ExtraDayRow[] {
  return (days ?? []).map((d, i) => ({
    id: `${i}_${d.date}`,
    date: isoToDisplay(d.date ?? ''),
    startTime: d.startTime ?? '',
    location: d.location ?? '',
  }))
}

/**
 * The rows that are worth saving, as stored.
 *
 * A row with no usable date is dropped rather than saved empty: instances are
 * expanded from these dates, and a blank one would produce a day that can
 * never be reached or removed.
 */
export function fromExtraDayRows(rows: ExtraDayRow[]): ExtraDay[] {
  return rows
    .map((row) => ({
      // As the form's own date is read: 11/20 the next one to come.
      date: typedDateToIso(row.date) || '',
      ...(row.startTime.trim() ? { startTime: tidyTime(row.startTime) } : {}),
      ...(row.location.trim() ? { location: row.location.trim() } : {}),
    }))
    .filter((d) => !!d.date)
}

/**
 * A date as typed into a date field, as stored (YYYY-MM-DD) — or '' for
 * nothing typed, or null for something that isn't a date. Takes it however
 * it comes: 11/20/26, 1/5/26, 01/5/2026, or already 2026-11-20 — and with
 * no year, 11/20, as the next one to come (displayToIso upcomingFrom). A day
 * that doesn't exist (2/30/26) is not one.
 */
export function typedDateToIso(typed: string, today: string = localDay()): string | null {
  const t = typed.trim()
  if (!t) return ''
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : displayToIso(t, { upcomingFrom: today })
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d
    ? iso
    : null
}

/** Today on this device, YYYY-MM-DD. */
function localDay(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
