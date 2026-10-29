import type { EventTemplate, EventInstance } from '@/types/events'
import { clockMinutes } from '@/lib/eventSchedule'
import type { ReportTime } from '../../functions/src/miriam/data'

export const TASK_SECTIONS = [
  { id: 'production', label: 'Production', color: '#f56c5a' },
  { id: 'teamcare', label: 'Team Care', color: '#2980b9' },
  { id: 'merch', label: 'Merch', color: '#8e44ad' },
  { id: 'network', label: 'Network', color: '#27ae60' },
  { id: 'media', label: 'Media', color: '#e67e22' },
] as const

export type TaskSectionId = (typeof TASK_SECTIONS)[number]['id']

export function getInstances(
  tmpl: EventTemplate,
  from: string,
  to: string,
  overrides: Record<string, Partial<EventTemplate>> = {}
): EventInstance[] {
  const list: EventInstance[] = []

  if (!tmpl.isRec) {
    if (tmpl.date && tmpl.date >= from && tmpl.date <= to) {
      const baseKey = `${tmpl.id}_${tmpl.date}`
      const ov = overrides[baseKey] ?? {}
      if (!(ov as Record<string, unknown>).deleted) {
        list.push({
          ...tmpl,
          ...ov,
          date: tmpl.date,
          instanceKey: baseKey,
          templateId: tmpl.id,
          _dayIndex: 0,
          _dayLabel: 'Day 1',
        })
      }
    }
    ;(tmpl.extraDays ?? []).forEach((ed, di) => {
      if (ed.date >= from && ed.date <= to) {
        const edKey = `${tmpl.id}_${ed.date}_d${di + 2}`
        const edOv = overrides[edKey] ?? {}
        if (!(edOv as Record<string, unknown>).deleted) {
          list.push({
            ...tmpl,
            date: ed.date,
            startTime: ed.startTime ?? tmpl.startTime,
            location: ed.location ?? tmpl.location,
            ...edOv,
            instanceKey: edKey,
            templateId: tmpl.id,
            _dayIndex: di + 1,
            _dayLabel: `Day ${di + 2}`,
            _isExtraDay: true,
          })
        }
      }
    })
    return list
  }

  const fDate = new Date(`${from}T12:00:00`)
  const tDate = new Date(`${to}T12:00:00`)
  const cap = tmpl.recEnd ? new Date(`${tmpl.recEnd}T12:00:00`) : tDate
  const capDate = cap < tDate ? cap : tDate

  const cur = new Date(fDate)
  while (cur.getDay() !== (tmpl.recDay ?? 0)) cur.setDate(cur.getDate() + 1)

  let n = 0
  while (cur <= capDate && n < 104) {
    const ds = cur.toISOString().split('T')[0]
    const key = `${tmpl.id}_${ds}`
    const ov = overrides[key] ?? {}
    if (!(ov as Record<string, unknown>).deleted) {
      const inst: EventInstance = {
        ...tmpl,
        ...ov,
        date: ds,
        instanceKey: key,
        templateId: tmpl.id,
      }
      if (!inst.teams) inst.teams = []
      list.push(inst)
    }
    const step = tmpl.recur === 'biweekly' ? 14 : tmpl.recur === 'monthly' ? 30 : 7
    cur.setDate(cur.getDate() + step)
    n++
  }
  return list
}

export function allInstances(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  from: string,
  to: string
): EventInstance[] {
  return templates
    .flatMap((t) => getInstances(t, from, to, overrides))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Whether this person is allowed to see this event at all.
 *
 * Separate from what the calendar chooses to *show*: the month view filters by
 * a toggle and by date, which is presentation. This is the access question,
 * and the detail screen had no answer to it — it rendered whatever event the
 * id resolved to, so a direct link showed someone an event they were never on.
 *
 * Pure, taking the already-resolved assignment rather than reaching for the
 * groups store, so the rule can be tested on its own.
 */
export function canViewEvent(
  ev: { isPublic?: boolean; unpublished?: boolean },
  viewer: { admin: boolean; assigned: boolean }
): boolean {
  // A draft is the admin's working copy and is not shown to anyone else,
  // whoever is on it.
  if (ev.unpublished === true) return viewer.admin
  return viewer.admin || viewer.assigned || ev.isPublic === true
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Today on this device's own calendar, YYYY-MM-DD. `todayStr` is the date in
 * UTC, which on an evening in the US is already tomorrow; the days Miriam
 * hears ("tomorrow", "Friday") are the person's own, as the calendar's are.
 */
export function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dateStr(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

/**
 * Each event once, at its next date: a recurring or multi-day event is one
 * entry in a list, not one a week. `list` in date order, as allInstances
 * gives it.
 */
export function nextOfEach(list: EventInstance[]): EventInstance[] {
  const seen = new Set<string>()
  return list.filter((ev) => {
    const key = String(ev.templateId ?? ev.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** How often a recurring event comes round — "every week" — or null for one that doesn't. */
export function repeatsSaid(ev: Pick<EventInstance, 'isRec' | 'recur'>): string | null {
  if (!ev.isRec) return null
  if (ev.recur === 'biweekly') return 'every other week'
  if (ev.recur === 'monthly') return 'every month'
  return 'every week'
}

/**
 * An event as a calendar file, to add to a phone's or computer's calendar.
 *
 * `team`: whether the person saving it sees the event's team side — dress
 * code and teams go in its notes only for them, as its page shows them only
 * to them (events/[id] isMember). `report`: the report times they are shown
 * (eventsStore reportTimesShown) — none unless they are on it.
 */
export function buildICS(
  ev: EventInstance,
  { team, report = [] }: { team: boolean; report?: ReportTime[] }
): string {
  const start = icsStart(ev.date, ev.startTime)
  // Two hours, for a start at a time; the next day, for a day with none (an
  // all-day entry's end is the day after it).
  const end = start ? icsShift(start, start.time ? 120 : 24 * 60) : null
  const uid_val = `thewell-${ev.id}${ev.instanceKey ?? ev.date ?? ''}-${Date.now()}@missionportal`
  const desc: string[] = []
  if (ev.isVirtual && ev.virtualLink) desc.push(`Join online: ${ev.virtualLink}`)
  for (const r of report) desc.push(`Report Time${r.who ? ` (${r.who})` : ''}: ${r.time}`)
  if (team) {
    if (ev.dcw) desc.push(`Dress Code (Worship): ${ev.dcw}`)
    if (ev.dcm) desc.push(`Dress Code (Mission): ${ev.dcm}`)
    if (ev.teams?.length) desc.push(`Teams: ${ev.teams.map((t) => t.name).join(', ')}`)
  }
  const where = ev.isVirtual
    ? 'Online'
    : [ev.location, ev.address, [ev.city, ev.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')

  const esc = (s: string) => (s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  const stamp = (t: IcsTime) => (t.time ? `:${t.date}T${t.time}00` : `;VALUE=DATE:${t.date}`)

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Well of Iowa//Mission Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid_val}`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')}`,
    ...(start && end ? [`DTSTART${stamp(start)}`, `DTEND${stamp(end)}`] : []),
    `SUMMARY:${esc(ev.title + (ev.isRec ? ' (Recurring)' : ''))}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(desc.join('\n') || 'The Well of Iowa Mission Event')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

/** A day, and a time on it ("1730") or none for the whole day. */
interface IcsTime {
  date: string
  time: string | null
}

/**
 * When an event starts, for its calendar file: its day, at its start time as
 * written — "5 PM", "5:00 PM", "17:00", "7pm", "noon" (eventSchedule
 * clockMinutes) — or at the first time written in it ("10:30 PM (doors at
 * 10)"). A start time it can't read leaves the whole day.
 */
function icsStart(dateStr?: string, timeStr?: string): IcsTime | null {
  if (!dateStr) return null
  const date = dateStr.replace(/-/g, '')
  const written = (timeStr ?? '').trim()
  const first = written.match(/\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|[ap]\b)?/i)?.[0]
  const minutes = written ? (clockMinutes(written) ?? (first ? clockMinutes(first) : null)) : null
  if (minutes === null) return { date, time: null }
  return {
    date,
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`,
  }
}

/** `at`, moved on by `minutes`: into the next day when it passes midnight. */
function icsShift(at: IcsTime, minutes: number): IcsTime {
  const y = Number(at.date.slice(0, 4))
  const mo = Number(at.date.slice(4, 6)) - 1
  const d = Number(at.date.slice(6, 8))
  const h = at.time ? Number(at.time.slice(0, 2)) : 0
  const mi = at.time ? Number(at.time.slice(2, 4)) : 0
  // By the calendar, in UTC, so no daylight-saving change moves it.
  const t = new Date(Date.UTC(y, mo, d, h, mi + minutes))
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`,
    time: at.time ? `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}` : null,
  }
}

/**
 * When a template's task is due, relative to the event it was created from.
 *
 * Extracted from EventFormModal so it can be tested: it was interleaved with
 * the Firestore writes that create each task, which made its edge cases —
 * recurring events having no single date, and post-event tasks counting
 * forward rather than back — unreachable from a test.
 *
 * Returns null when there is no date to anchor to, which is the case for
 * recurring events.
 */
export function taskDueDate(
  eventDate: string | null,
  task: { daysBefore?: number; daysAfterEvent?: number }
): string | null {
  if (!eventDate) return null

  const daysAfter = task.daysAfterEvent ?? 0
  const offset = daysAfter > 0 ? daysAfter : -(task.daysBefore ?? 0)
  if (offset === 0) return null

  // Parsed at midday so a date-only string cannot slip a day when the shift
  // crosses a daylight-saving boundary.
  const d = new Date(`${eventDate}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}
