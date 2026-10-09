/**
 * What Miriam may tell someone about the app's data: the same as the app
 * shows them, worked out the same way.
 *
 * The database lets any signed-in member read events, availability and
 * tasks; what each person actually sees is decided by the screens. These are
 * those screens' rules, so a question can never show more than the app does:
 *
 * - Events: an admin sees every event; anyone else, those they are on — by
 *   name, by group or by team — and public ones. A draft is the admin's
 *   alone. (lib/events canViewEvent, stores/eventsStore resolveAssignedUids.)
 * - Dress code: the entry for your team, or for everyone else; an admin sees
 *   them all. (EventDetailModal DressCodeDisplay.)
 * - Availability: your own; an admin sees everyone's. (events/[id] shows
 *   your own; admin/avail everyone's.)
 * - Tasks: those you are assigned; an admin sees them all. (assignments.)
 * - Flights, lodging, carpool: your own; an admin sees everyone's.
 *   (EventDetailModal FlightDisplay, LodgingDisplay, CarpoolReadOnly.)
 * - Food: the sign-up sheet, who brings what, as everyone on it sees it.
 *   (EventDetailModal FoodPanel.)
 * - Meeting and sign-up links: to anyone who can see the event.
 *
 * Kept free of Firebase so it can be tested on its own
 * (src/lib/miriamData.test.ts in the app).
 */

import { nameScore } from './names'

export interface Viewer {
  uid: string
  roles: string[]
}

export const isAdminViewer = (v: Viewer) => v.roles.includes('admin')

/** A member, or a guest: anyone who is not a public follower only. */
export function canAsk(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((r) => r !== 'public')
}

export interface Team {
  name: string
  leaders: (string | number)[]
  members: (string | number)[]
}
export interface DressCodeEntry {
  group: string
  text: string
}
export interface EventTemplate {
  id: string
  title: string
  date?: string
  isRec?: boolean
  recur?: 'weekly' | 'biweekly' | 'monthly'
  recDay?: number
  recEnd?: string | null
  location?: string
  address?: string
  city?: string
  state?: string
  isVirtual?: boolean
  startTime?: string
  rtp?: string
  rtm?: string
  dcw?: string
  dcm?: string
  users?: (string | number)[]
  groups?: string[]
  teams?: Team[]
  dressCode?: DressCodeEntry[]
  isPublic?: boolean
  unpublished?: boolean
  deleted?: boolean
  food?: boolean
  carpool?: boolean
  extraDays?: { date: string; startTime?: string; location?: string }[]
  virtualLink?: string
  signUpLink?: string
  foodItems?: string[]
  carpoolCars?: Car[]
  carpoolLoc?: string
  lodging?: boolean
  lodgingEntries?: Lodging[]
  flights?: boolean
  flightEntries?: Flight[]
}
export interface Car {
  id: string
  label: string
  driver: string
  riders: string[]
}
export interface Lodging {
  name: string
  address?: string
  room?: string
  confirmation?: string
  assignees: string[]
}
export interface Flight {
  uid: string
  outDate?: string
  outTime?: string
  outAirport?: string
  outAirline?: string
  outFlight?: string
  outArrival?: string
  outConfirmation?: string
  retDate?: string
  retTime?: string
  retAirport?: string
  retAirline?: string
  retFlight?: string
  retArrival?: string
  retConfirmation?: string
}
export interface EventInstance extends EventTemplate {
  date: string
  instanceKey: string
  templateId: string
}
export interface Group {
  id: string
  name: string
  members: string[]
}
export type AvailStatus = 'yes' | 'no' | 'partial' | 'tbd'
export interface AvailResponse {
  status: AvailStatus
  note?: string
}
export interface Task {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'done' | 'behind'
  assignees: (string | number)[]
  lead?: string | number | null
  dueDate?: string | null
  evTemplateId?: string | number | null
  evDate?: string | null
}

const same = (a: unknown, b: unknown) => String(a) === String(b)

// --- Events -----------------------------------------------------------------

/** One template's dates between `from` and `to` (YYYY-MM-DD): lib/events getInstances. */
export function instancesOf(
  tmpl: EventTemplate,
  from: string,
  to: string,
  overrides: Record<string, Partial<EventTemplate>> = {}
): EventInstance[] {
  if (tmpl.deleted) return []
  const list: EventInstance[] = []
  const gone = (ov: Partial<EventTemplate>) => (ov as { deleted?: boolean }).deleted === true
  if (!tmpl.isRec) {
    if (tmpl.date && tmpl.date >= from && tmpl.date <= to) {
      const key = `${tmpl.id}_${tmpl.date}`
      const ov = overrides[key] ?? {}
      if (!gone(ov))
        list.push({ ...tmpl, ...ov, date: tmpl.date, instanceKey: key, templateId: tmpl.id })
    }
    ;(tmpl.extraDays ?? []).forEach((ed, i) => {
      if (ed.date < from || ed.date > to) return
      const key = `${tmpl.id}_${ed.date}_d${i + 2}`
      const ov = overrides[key] ?? {}
      if (gone(ov)) return
      list.push({
        ...tmpl,
        date: ed.date,
        startTime: ed.startTime ?? tmpl.startTime,
        location: ed.location ?? tmpl.location,
        ...ov,
        instanceKey: key,
        templateId: tmpl.id,
      })
    })
    return list
  }
  const end = new Date(`${to}T12:00:00`)
  const cap = tmpl.recEnd ? new Date(`${tmpl.recEnd}T12:00:00`) : end
  const last = cap < end ? cap : end
  const cur = new Date(`${from}T12:00:00`)
  while (cur.getDay() !== (tmpl.recDay ?? 0)) cur.setDate(cur.getDate() + 1)
  for (let n = 0; cur <= last && n < 104; n++) {
    const ds = cur.toISOString().slice(0, 10)
    const key = `${tmpl.id}_${ds}`
    const ov = overrides[key] ?? {}
    if (!gone(ov)) list.push({ ...tmpl, ...ov, date: ds, instanceKey: key, templateId: tmpl.id })
    cur.setDate(
      cur.getDate() + (tmpl.recur === 'biweekly' ? 14 : tmpl.recur === 'monthly' ? 30 : 7)
    )
  }
  return list
}

/** Everyone on an event: by name, by group and by team. */
export function assignedTo(ev: EventTemplate, groups: Group[]): Set<string> {
  const out = new Set<string>()
  ;(ev.users ?? []).forEach((u) => out.add(String(u)))
  for (const gid of ev.groups ?? []) {
    groups.find((g) => g.id === gid)?.members.forEach((m) => out.add(String(m)))
  }
  for (const t of ev.teams ?? []) {
    t.leaders.forEach((u) => out.add(String(u)))
    t.members.forEach((u) => out.add(String(u)))
  }
  return out
}

/** Whether this person may see this event at all: lib/events canViewEvent. */
export function canSeeEvent(ev: EventTemplate, viewer: Viewer, groups: Group[]): boolean {
  const admin = isAdminViewer(viewer)
  if (ev.unpublished === true) return admin
  return admin || ev.isPublic === true || assignedTo(ev, groups).has(viewer.uid)
}

/** How well an event's or task's name answers a name said for it, 0 to 1 (./names). */
export function titleMatch(title: string, query: string): number {
  return nameScore(title, query)
}

/**
 * Events this person can see whose name — or city, or venue — fits what was
 * said, nearest first, upcoming before past; on one date, if one is given.
 * With nothing said, the next few they can see.
 */
export function findEvents(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  viewer: Viewer,
  query: string,
  today: string,
  date = '',
  limit = 6
): EventInstance[] {
  const from = shiftDate(today, -60)
  const to = shiftDate(today, 365)
  const seen = templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, from, to, overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups))
    .filter((ev) => !date || ev.date === date)
  const named = (ev: EventInstance) => [ev.title, ev.city, ev.location].filter(Boolean).join(' ')
  const scored = seen
    .map((ev) => ({ ev, score: query.trim() ? titleMatch(named(ev), query) : 1 }))
    .filter((x) => x.score >= 0.5)
  const distance = (d: string) =>
    (d >= today ? 0 : 1_000_000) + Math.abs(dayNumber(d) - dayNumber(today))
  return scored
    .sort((a, b) => b.score - a.score || distance(a.ev.date) - distance(b.ev.date))
    .slice(0, limit)
    .map((x) => x.ev)
}

/**
 * When nothing fits well: the few events this person can see whose names
 * come nearest to what was said, to offer — never one they cannot see.
 */
export function closestEvents(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  viewer: Viewer,
  query: string,
  today: string,
  limit = 3
): EventInstance[] {
  if (!query.trim()) return []
  const seen = templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, shiftDate(today, -60), shiftDate(today, 365), overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups))
  // One date per name: the nearest upcoming, else the latest past.
  const byTitle = new Map<string, EventInstance>()
  for (const ev of seen.sort((a, b) => a.date.localeCompare(b.date))) {
    const had = byTitle.get(ev.title)
    if (!had || (had.date < today && ev.date >= today) || (had.date < today && ev.date > had.date))
      byTitle.set(ev.title, ev)
  }
  return [...byTitle.values()]
    .map((ev) => ({ ev, score: titleMatch(ev.title, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.ev)
}

/** The instance a key names, if this person can see it. */
export function eventByKey(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  viewer: Viewer,
  key: string
): EventInstance | null {
  const m = /^(.+?)_(\d{4}-\d{2}-\d{2})(_d\d+)?$/.exec(key)
  if (!m) return null
  const tmpl = templates.find((t) => t.id === m[1])
  if (!tmpl) return null
  const ev = instancesOf(tmpl, m[2], m[2], overrides).find((i) => i.instanceKey === key)
  return ev && canSeeEvent(ev, viewer, groups) ? ev : null
}

/** The dress code this person is shown — or, for an admin, every entry. */
export function dressCodeFor(ev: EventTemplate, viewer: Viewer): string[] {
  if (ev.dressCode?.length) {
    if (isAdminViewer(viewer)) {
      return ev.dressCode.map((e) => {
        const who = e.group === '_remainder_' ? 'Everyone else' : e.group
        return `${who}: ${e.text}`
      })
    }
    const team = (ev.teams ?? []).find(
      (t) =>
        t.members.some((m) => same(m, viewer.uid)) || t.leaders.some((m) => same(m, viewer.uid))
    )
    const mine =
      ev.dressCode.find((e) => e.group === (team?.name ?? 'Unassigned')) ??
      ev.dressCode.find((e) => e.group === '_remainder_')
    return mine ? [mine.text] : []
  }
  const legacy: string[] = []
  if (ev.dcw) legacy.push(`Worship: ${ev.dcw}`)
  if (ev.dcm) legacy.push(`Mission: ${ev.dcm}`)
  return legacy
}

// --- Getting there and staying ----------------------------------------------

const nameOf = (names: Map<string, string>, uid: string) => names.get(String(uid)) ?? 'someone'

/** The cars: yours, or every one for an admin — driver and riders by name. */
export function carpoolFor(
  ev: EventTemplate,
  viewer: Viewer,
  names: Map<string, string>
): string[] {
  const cars = ev.carpoolCars ?? []
  const mine = (c: Car) => same(c.driver, viewer.uid) || c.riders.some((r) => same(r, viewer.uid))
  const shown = isAdminViewer(viewer) ? cars : cars.filter(mine)
  return shown.map((c, i) => {
    const label = c.label || `Car ${cars.indexOf(c) + 1 || i + 1}`
    const driver = c.driver ? `driven by ${nameOf(names, c.driver)}` : 'no driver yet'
    const riders = c.riders.length
      ? `, riding: ${c.riders.map((r) => nameOf(names, r)).join(', ')}`
      : ''
    return `${label}${mine(c) ? ' (your car)' : ''}: ${driver}${riders}`
  })
}

const flightLine = (f: Flight, way: 'out' | 'ret') => {
  const g = (k: string) => (f as unknown as Record<string, string | undefined>)[`${way}${k}`]
  const parts = [
    g('Date') && `on ${g('Date')}`,
    g('Time') && `at ${g('Time')}`,
    g('Airport') && `from ${g('Airport')}`,
    [g('Airline'), g('Flight')].filter(Boolean).join(' ') || null,
    g('Arrival') && `arriving ${g('Arrival')}`,
    g('Confirmation') && `confirmation ${g('Confirmation')}`,
  ].filter(Boolean)
  return parts.length ? `${way === 'out' ? 'Going' : 'Returning'}: ${parts.join(', ')}` : null
}

/** Flights: yours, or everyone's for an admin. */
export function flightsFor(
  ev: EventTemplate,
  viewer: Viewer,
  names: Map<string, string>
): string[] {
  const shown = (ev.flightEntries ?? []).filter(
    (f) => isAdminViewer(viewer) || same(f.uid, viewer.uid)
  )
  return shown.map((f) => {
    const who = same(f.uid, viewer.uid) ? 'Your flight' : `${nameOf(names, f.uid)}’s flight`
    const legs = [flightLine(f, 'out'), flightLine(f, 'ret')].filter(Boolean)
    return `${who}. ${legs.join('. ') || 'No details yet.'}`
  })
}

/** Where to stay: yours, or every entry for an admin. */
export function lodgingFor(
  ev: EventTemplate,
  viewer: Viewer,
  names: Map<string, string>
): string[] {
  const mine = (l: Lodging) => l.assignees.some((a) => same(a, viewer.uid))
  const shown = (ev.lodgingEntries ?? []).filter((l) => isAdminViewer(viewer) || mine(l))
  return shown.map((l) => {
    const parts = [
      l.address,
      l.room && `room ${l.room}`,
      l.confirmation && `confirmation ${l.confirmation}`,
      isAdminViewer(viewer) && `for ${l.assignees.map((a) => nameOf(names, a)).join(', ')}`,
    ].filter(Boolean)
    return `${l.name}${mine(l) ? ' (yours)' : ''}${parts.length ? `: ${parts.join(', ')}` : ''}`
  })
}

/** The food sign-up sheet, as everyone on the event sees it, and what is yours. */
export function foodFor(
  ev: EventTemplate,
  signups: Record<string, { uid: string; displayName?: string }>,
  viewer: Viewer,
  names: Map<string, string>
): { mine: string[]; sheet: string[] } {
  const items = ev.foodItems ?? []
  const mine: string[] = []
  const sheet = items.map((item, i) => {
    const s = signups[String(i)]
    if (s && same(s.uid, viewer.uid)) mine.push(item)
    const who = s
      ? same(s.uid, viewer.uid)
        ? 'you'
        : s.displayName || nameOf(names, s.uid)
      : 'nobody yet'
    return `${item}: ${who}`
  })
  return { mine, sheet }
}

// --- Availability -------------------------------------------------------------

export const AVAIL_LABELS: Record<AvailStatus, string> = {
  yes: 'Available',
  no: 'Not available',
  partial: 'Partly available',
  tbd: 'Not sure yet (TBD)',
}

/** The availability doc key for an instance, and its series': lib/availability. */
export const availKey = (ev: EventInstance) => ev.instanceKey.replace(/\//g, '_')
export const seriesAvailKey = (templateId: string) =>
  String(templateId).replace(/\//g, '_') + '_series'

/** A response for this date, else — for a recurring event — the series': effectiveAvail. */
export function effectiveResponse(
  ev: EventInstance,
  uid: string,
  instance: Record<string, AvailResponse>,
  series: Record<string, AvailResponse>
): AvailResponse | null {
  return instance[uid] ?? (ev.isRec ? (series[uid] ?? null) : null)
}

/**
 * Who on an event is not plainly available: not available, partly, not sure
 * yet, or not answered — with what they wrote. For an admin; anyone else is
 * told only their own (`mine`).
 */
export function availabilityReport(
  ev: EventInstance,
  groups: Group[],
  names: Map<string, string>,
  instance: Record<string, AvailResponse>,
  series: Record<string, AvailResponse>,
  viewer: Viewer
): {
  mine: string | null
  everyone?: {
    notAvailable: string[]
    partly: string[]
    notSure: string[]
    noAnswer: string[]
    available: number
    total: number
  }
} {
  const own = effectiveResponse(ev, viewer.uid, instance, series)
  const mine = own ? `${AVAIL_LABELS[own.status]}${own.note ? ` — “${own.note}”` : ''}` : null
  if (!isAdminViewer(viewer)) return { mine }
  const people = [...assignedTo(ev, groups)].filter((uid) => names.has(uid))
  const out = {
    notAvailable: [] as string[],
    partly: [] as string[],
    notSure: [] as string[],
    noAnswer: [] as string[],
    available: 0,
    total: people.length,
  }
  for (const uid of people) {
    const name = names.get(uid)!
    const r = effectiveResponse(ev, uid, instance, series)
    const withNote = (n: string) => (r?.note ? `${n} (“${r.note}”)` : n)
    if (!r) out.noAnswer.push(name)
    else if (r.status === 'no') out.notAvailable.push(withNote(name))
    else if (r.status === 'partial') out.partly.push(withNote(name))
    else if (r.status === 'tbd') out.notSure.push(withNote(name))
    else out.available++
  }
  for (const list of [out.notAvailable, out.partly, out.notSure, out.noAnswer]) list.sort()
  return { mine, everyone: out }
}

// --- Tasks --------------------------------------------------------------------

export const TASK_STATUS: Record<Task['status'], string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  behind: 'Behind',
}

export function canSeeTask(t: Task, viewer: Viewer): boolean {
  return isAdminViewer(viewer) || t.assignees.some((a) => same(a, viewer.uid))
}

/** Tasks this person can see whose title fits what was said; open ones first. */
export function findTasks(tasks: Task[], viewer: Viewer, query: string, limit = 8): Task[] {
  const open = (t: Task) => (t.status === 'done' ? 1 : 0)
  return tasks
    .filter((t) => canSeeTask(t, viewer))
    .map((t) => ({ t, score: query.trim() ? titleMatch(t.title, query) : 1 }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || open(a.t) - open(b.t))
    .slice(0, limit)
    .map((x) => x.t)
}

// --- Dates --------------------------------------------------------------------

function dayNumber(d: string): number {
  return Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000)
}
export function shiftDate(d: string, days: number): string {
  return new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
