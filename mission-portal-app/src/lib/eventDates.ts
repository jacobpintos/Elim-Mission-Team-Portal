import type { ExtraDay } from '@/types/events'

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

export function displayToIso(display: string): string {
  if (!display) return ''
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!match) return ''
  const [, m, d, y] = match
  const mn = Number(m),
    dn = Number(d)
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return ''
  const fullYear = y.length <= 2 ? `20${y.padStart(2, '0')}` : y
  return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
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
      date: displayToIso(row.date),
      ...(row.startTime.trim() ? { startTime: row.startTime.trim() } : {}),
      ...(row.location.trim() ? { location: row.location.trim() } : {}),
    }))
    .filter((d) => !!d.date)
}
