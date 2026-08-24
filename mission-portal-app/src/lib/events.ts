import type { EventTemplate, EventInstance } from '@/types/events'

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

export function dateStr(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

export function buildICS(ev: EventInstance): string {
  const dtStart = icsDate(ev.date, ev.startTime)
  let dtEnd = dtStart
  if (dtStart.includes('T')) {
    const h2 = parseInt(dtStart.slice(9, 11)) + 2
    dtEnd = dtStart.slice(0, 9) + String(h2 % 24).padStart(2, '0') + dtStart.slice(11)
  }
  const uid_val = `thewell-${ev.id}${ev.instanceKey ?? ev.date ?? ''}-${Date.now()}@missionportal`
  const desc: string[] = []
  if (ev.rtp) desc.push(`Report Time (Production): ${ev.rtp}`)
  if (ev.rtm) desc.push(`Report Time (Mission): ${ev.rtm}`)
  if (ev.dcw) desc.push(`Dress Code (Worship): ${ev.dcw}`)
  if (ev.dcm) desc.push(`Dress Code (Mission): ${ev.dcm}`)
  if (ev.teams?.length) desc.push(`Teams: ${ev.teams.map((t) => t.name).join(', ')}`)

  const esc = (s: string) => (s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Well of Iowa//Mission Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid_val}`,
    `DTSTAMP:${icsDate(new Date().toISOString().split('T')[0])}`,
    `DTSTART${dtStart.includes('T') ? '' : ';VALUE=DATE'}:${dtStart}`,
    `DTEND${dtEnd.includes('T') ? '' : ';VALUE=DATE'}:${dtEnd}`,
    `SUMMARY:${esc(ev.title + (ev.isRec ? ' (Recurring)' : ''))}`,
    `LOCATION:${esc(ev.location ?? '')}`,
    `DESCRIPTION:${esc(desc.join('\\n') || 'The Well of Iowa Mission Event')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function icsDate(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return ''
  const d = dateStr.replace(/-/g, '')
  if (!timeStr) return d
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return d
  let h = parseInt(m[1]),
    mn = parseInt(m[2])
  const ampm = (m[3] ?? '').toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${d}T${String(h).padStart(2, '0')}${String(mn).padStart(2, '0')}00`
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
