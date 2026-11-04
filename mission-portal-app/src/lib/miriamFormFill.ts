import type { DressCodeEntry, EventTeam, ReportTimeEntry, ScheduleItem } from '@/types/events'
import type { EventDraft } from './miriam'

/**
 * The event form open on the screen, and Miriam: what it holds, said as she
 * is told it (functions/src/miriam/plan: formOnScreenSaid) — and what she
 * fills in, put into it over what is there (features/events/EventFormModal).
 *
 * Pure, so it can be tested without a form.
 */

/**
 * A list kept by name — teams, report times, dress code — with those given
 * put in: one given in place of the one of its name, the rest added after.
 * Those of the form's not given stay, as she is told they do.
 */
export function byName<T>(now: T[], given: T[] | undefined, name: (t: T) => string): T[] {
  if (!given) return now
  const key = (t: T) => name(t).trim().toLowerCase()
  const fresh = new Map(given.map((t) => [key(t), t]))
  const kept = now.map((t) => fresh.get(key(t)) ?? t)
  const had = new Set(now.map(key))
  return [...kept, ...given.filter((t) => !had.has(key(t)))]
}

/** Her schedule as the form keeps it: each item with an id of its own. */
export function scheduleOf(given: EventDraft['schedule'], stamp = Date.now()): ScheduleItem[] {
  return (given ?? []).map((s, i) => ({
    id: `${stamp}_${i}`,
    time: s.time,
    title: s.title,
    ...(s.endTime ? { endTime: s.endTime } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
  }))
}

/** What the form holds, as described to her. */
export interface FormNow {
  title: string
  /** As typed: "11/20/26". */
  date: string
  startTime: string
  location: string
  address: string
  city: string
  state: string
  isRec: boolean
  recur?: string
  recDay: number
  isPublic: boolean
  isVirtual: boolean
  virtualLink: string
  food: boolean
  foodItems: string[]
  carpool: boolean
  cars: number
  lodging: number
  flights: number
  users: (string | number)[]
  groups: string[]
  teams: EventTeam[]
  reportTimes: ReportTimeEntry[]
  schedule: ScheduleItem[]
  dressCode: DressCodeEntry[]
  taskTemplate: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** Past this many, the rest are counted rather than named. */
const MOST_NAMED = 40

/**
 * The form as she is told it, a line each: only what is filled in. People and
 * groups by name with their ids — "Emily Ruiz [u5]" — so what she is asked to
 * change of them she can name.
 */
export function formLines(
  form: FormNow,
  personName: (uid: string) => string,
  groupName: (id: string) => string
): string[] {
  const lines: string[] = []
  const add = (label: string, value: string | false | undefined | null) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`)
  }
  const named = (ids: string[], nameOf: (id: string) => string) => {
    const shown = ids.slice(0, MOST_NAMED).map((id) => `${nameOf(id)} [${id}]`)
    const more = ids.length - shown.length
    return shown.join(', ') + (more > 0 ? `, and ${more} more` : '')
  }
  const forWhom = (group: string) => (group === '_remainder_' ? 'everyone else' : group)

  add('Title', form.title)
  add(form.isRec ? 'Starting' : 'Date', form.date)
  if (form.isRec) add('Repeats', `${form.recur ?? 'weekly'}, on ${DAYS[form.recDay] ?? 'Sunday'}`)
  add('Starts', form.startTime)
  add('Venue', form.location)
  add('Address', form.address)
  add('City', [form.city, form.state].filter(Boolean).join(', '))
  if (form.isPublic) lines.push('Public: yes')
  if (form.isVirtual) add('Virtual', form.virtualLink || 'yes, no link yet')
  add('Groups', named(form.groups.map(String), groupName))
  add('People', named(form.users.map(String), personName))
  add(
    'Teams',
    form.teams
      .map(
        (t) =>
          `${t.name} (${t.members.map((m) => personName(String(m))).join(', ') || 'no one yet'})`
      )
      .join('; ')
  )
  add('Report times', form.reportTimes.map((r) => `${forWhom(r.group)} ${r.time}`).join('; '))
  add('Schedule', form.schedule.map((s) => [s.time, s.title].filter(Boolean).join(' ')).join('; '))
  if (form.food)
    add('Food', form.foodItems.filter((f) => f.trim()).join(', ') || 'on, no items yet')
  add('Dress code', form.dressCode.map((d) => `${forWhom(d.group)} — ${d.text}`).join('; '))
  if (form.carpool || form.cars) add('Cars', String(form.cars))
  if (form.lodging) add('Lodging', `${form.lodging} place${form.lodging === 1 ? '' : 's'}`)
  if (form.flights) add('Flights', `${form.flights} ${form.flights === 1 ? 'person' : 'people'}`)
  add('Task template', form.taskTemplate)
  return lines
}
