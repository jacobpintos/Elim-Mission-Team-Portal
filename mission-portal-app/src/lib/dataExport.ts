/**
 * The app's records as spreadsheets, for admins.
 *
 * Pure: each builder takes plain records and returns CSV text, so what goes in
 * a column can be tested without Firestore. Admin → Data reads the records and
 * hands the text to saveTextFile.
 *
 * This is a copy to open in Excel or Google Sheets, not a backup to restore
 * from — that is the nightly export (functions/src/backups.ts).
 */
import type { EventTemplate, AvailResponse, Task } from '@/types/events'
import type { UserProfile } from '@/types/user'
import type { Reimbursement } from '@/types/reimbursement'
import { formatCents } from '@/lib/money'

type Cell = string | number | boolean | null | undefined

/**
 * One CSV field, quoted when it must be.
 *
 * A leading =, +, - or @ is prefixed with an apostrophe: a spreadsheet would
 * otherwise run it as a formula, and these cells hold text people typed.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows to CSV, header first, with Windows line endings Excel expects. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function peopleCsv(users: UserProfile[]): string {
  return toCsv(
    ['Name', 'Email', 'Roles', 'Title', 'Last sign-in'],
    [...users]
      .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
      .map((u) => [
        u.displayName,
        u.email,
        (u.roles ?? []).join(' '),
        u.title ?? '',
        u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 10) : '',
      ])
  )
}

export function eventsCsv(events: EventTemplate[]): string {
  return toCsv(
    [
      'Event',
      'Date',
      'Recurring',
      'Start time',
      'Location',
      'City',
      'State',
      'Extra days',
      'Public',
    ],
    events
      .filter((e) => !e.deleted)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .map((e) => [
        e.title,
        e.date ?? '',
        e.isRec ? (e.recur ?? 'yes') : '',
        e.startTime ?? '',
        e.location ?? '',
        e.city ?? '',
        e.state ?? '',
        (e.extraDays ?? []).map((d) => d.date).join(' '),
        e.isPublic ? 'yes' : '',
      ])
  )
}

/**
 * Which event and date an availability key is about.
 *
 * Keys are `${eventId}_${date}`, `${eventId}_${date}_d2` for a later day of a
 * trip, or `${eventId}_series` for a whole recurring event. Event ids are
 * matched against the known events, longest first, so an id that itself holds
 * an underscore is not cut short.
 */
export function parseAvailKey(
  key: string,
  eventIds: string[]
): { eventId: string; date: string; day: string } | null {
  const id = [...eventIds].sort((a, b) => b.length - a.length).find((e) => key.startsWith(`${e}_`))
  if (!id) return null
  const rest = key.slice(id.length + 1)
  if (rest === 'series') return { eventId: id, date: '', day: 'Every date' }
  const m = rest.match(/^(\d{4}-\d{2}-\d{2})(?:_d(\d+))?$/)
  if (!m) return null
  return { eventId: id, date: m[1], day: m[2] ? `Day ${m[2]}` : '' }
}

const AVAIL_WORDS: Record<AvailResponse['status'], string> = {
  yes: 'Available',
  no: 'Not available',
  partial: 'Partial',
  tbd: 'TBD',
}

export function availabilityCsv(
  avail: Record<string, Record<string, AvailResponse>>,
  events: EventTemplate[],
  nameOf: (uid: string) => string
): string {
  const ids = events.map((e) => String(e.id))
  const title = new Map(events.map((e) => [String(e.id), e.title]))
  const rows: Cell[][] = []
  for (const [key, responses] of Object.entries(avail)) {
    const where = parseAvailKey(key, ids)
    if (!where) continue
    for (const [uid, r] of Object.entries(responses)) {
      rows.push([
        title.get(where.eventId) ?? where.eventId,
        where.date,
        where.day,
        nameOf(uid),
        AVAIL_WORDS[r.status] ?? r.status,
        r.note ?? '',
      ])
    }
  }
  rows.sort((a, b) => `${a[1]}|${a[0]}|${a[3]}`.localeCompare(`${b[1]}|${b[0]}|${b[3]}`))
  return toCsv(['Event', 'Date', 'Day', 'Person', 'Answer', 'Note'], rows)
}

export function tasksCsv(
  tasks: Task[],
  nameOf: (uid: string) => string,
  eventTitle: (t: Task) => string
): string {
  return toCsv(
    ['Task', 'Status', 'Assigned to', 'Due', 'Event'],
    tasks.map((t) => [
      t.title,
      t.status,
      t.assignees.map((a) => nameOf(String(a))).join('; '),
      t.dueDate ?? '',
      eventTitle(t),
    ])
  )
}

export function reimbursementsCsv(requests: Reimbursement[]): string {
  return toCsv(
    [
      'Asked',
      'Kind',
      'Owed to',
      'Event',
      'Items',
      'Total asked',
      'Status',
      'Approved',
      'Reason',
      'Pay by',
      'Paid on',
    ],
    [...requests]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => [
        new Date(r.createdAt).toISOString().slice(0, 10),
        r.kind === 'external' ? 'Outside bill' : 'Team member',
        r.payee ?? r.submitterName,
        r.eventTitle,
        r.items.map((i) => `${i.description} ${formatCents(i.amount)}`).join('; '),
        formatCents(r.total),
        r.status,
        r.approvedAmount === null ? '' : formatCents(r.approvedAmount),
        r.reason,
        r.payBy ?? '',
        r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : '',
      ])
  )
}
