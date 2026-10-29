import {
  assignedTo,
  availabilityReport,
  canSeeEvent,
  canSeeTask,
  carpoolFor,
  closestEvents,
  dressCodeFor,
  eventByKey,
  findEvents,
  findTasks,
  flightsFor,
  foodFor,
  isAdminViewer,
  lodgingFor,
  TASK_STATUS,
  effectiveResponse,
  instancesOf,
  AVAIL_LABELS,
  availKey,
  seriesAvailKey,
  type AvailResponse,
  type Car,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Task,
  type Viewer,
  scheduleFor,
  reportTimesFor,
  reportTimesSaid,
  yoursAt,
  seesOwnNotes,
  seesTeamSide,
  teamsOf,
} from './data'
import { FORECAST_DAYS, forecastFor } from './weather'
import { eventAccess, mergeEvent, withoutPrivate } from '../eventPrivate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fields = Record<string, any>
interface Snapshot {
  id: string
  data(): Fields | undefined
}
/** A document from a collection's listing: always has its fields. */
interface Listed {
  id: string
  data(): Fields
}
/**
 * The little of Firestore the lookups use — admin.firestore() is one — so
 * this file, and the app's tests of it, need nothing from firebase-admin.
 */
export interface Db {
  collection(name: string): { get(): Promise<{ docs: Listed[] }> }
  doc(path: string): { get(): Promise<Snapshot> }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** "Friday, 2026-09-25": the day said with the date, as it will be spoken. */
export const withWeekday = (d: string) =>
  `${WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${d}`

/**
 * What Miriam's questions read, fetched once per request and only when a
 * question needs it — and always passed through ./data.ts, so what comes out
 * is what this person may see.
 */
export class Lookups {
  private events?: Promise<{
    templates: EventTemplate[]
    overrides: Record<string, Partial<EventTemplate>>
  }>
  private groupsP?: Promise<Group[]>
  private namesP?: Promise<Map<string, string>>
  private tasksP?: Promise<Task[]>

  constructor(
    private db: Db,
    private viewer: Viewer,
    private today: string
  ) {}

  groups(): Promise<Group[]> {
    this.groupsP ??= this.db
      .collection('groups')
      .get()
      .then((snap) =>
        snap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name ?? ''),
          members: Array.isArray(d.data().members) ? d.data().members.map(String) : [],
        }))
      )
    return this.groupsP
  }

  names(): Promise<Map<string, string>> {
    this.namesP ??= this.db
      .collection('users')
      .get()
      .then(
        (snap) =>
          new Map(
            snap.docs
              .filter((d) => d.data().displayName)
              .map((d) => [d.id, String(d.data().displayName)] as [string, string])
          )
      )
    return this.namesP
  }

  /**
   * Every event — with its private details (../eventPrivate) only where the
   * database would give them to this person: an admin, or someone on it who
   * holds no public role (firestore.rules eventPrivate). Anyone else is told
   * of an event what they could read of it themselves.
   */
  private eventData() {
    this.events ??= Promise.all([
      this.db.collection('events').get(),
      this.db.collection('eventPrivate').get(),
      this.groups(),
    ]).then(([snap, closed, groups]) => {
      const privateOf = new Map(closed.docs.map((d) => [d.id, d.data()]))
      const { uid } = this.viewer
      const templates: EventTemplate[] = []
      const overrides: Record<string, Partial<EventTemplate>> = {}
      for (const d of snap.docs) {
        const open = d.data()
        const priv = privateOf.get(d.id)
        // No private record yet (being moved into one): who is on it, from the event.
        const access = Array.isArray(priv?.access) ? priv.access : eventAccess(open, groups)
        const sees =
          isAdminViewer(this.viewer) || (seesTeamSide(this.viewer) && access.includes(uid))
        const { overrides: ov, ...t } = (
          sees ? mergeEvent(open, priv) : withoutPrivate(open)
        ) as EventTemplate & {
          overrides?: Record<string, Partial<EventTemplate>>
        }
        templates.push({ ...t, id: d.id })
        Object.assign(overrides, ov ?? {})
      }
      return { templates, overrides }
    })
    return this.events
  }

  private tasks(): Promise<Task[]> {
    this.tasksP ??= this.db
      .collection('tasks')
      .get()
      .then((snap) => snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id })))
    return this.tasksP
  }

  /** The event a key names, if this person may see it. */
  async event(key: string): Promise<EventInstance | null> {
    const [{ templates, overrides }, groups] = await Promise.all([this.eventData(), this.groups()])
    return eventByKey(templates, overrides, groups, this.viewer, key)
  }

  /**
   * An event's food sign-up: its items, and who has taken which, by each
   * item's place on the sheet (foodSignups/{templateId}_{date}, as the app
   * keeps it: src/lib/foodSignups). Only for an event this person can see.
   */
  async foodSheet(ev: EventInstance): Promise<{
    items: string[]
    signups: Record<string, { uid: string; displayName?: string }>
  }> {
    // Its page shows the sheet to its team's members only (./data: seesTeamSide).
    const items = ev.food && seesTeamSide(this.viewer) ? (ev.foodItems ?? []) : []
    if (items.length === 0) return { items, signups: {} }
    const signups = ((await this.db.doc(`foodSignups/${ev.templateId}_${ev.date}`).get()).data()
      ?.signups ?? {}) as Record<string, { uid: string; displayName?: string }>
    return { items, signups }
  }

  /** The dates of events this person can see between two days, soonest first. */
  async eventsBetween(from: string, to: string): Promise<EventInstance[]> {
    const [{ templates, overrides }, groups] = await Promise.all([this.eventData(), this.groups()])
    return templates
      .filter((t) => canSeeEvent(t, this.viewer, groups))
      .flatMap((t) => instancesOf(t, from, to, overrides))
      .filter((ev) => canSeeEvent(ev, this.viewer, groups))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || String(a.startTime ?? '').localeCompare(b.startTime ?? '')
      )
  }

  /**
   * Their own notes on days of their calendar between two days, by day then
   * as written (src/lib/dateNotes, kept in dateNotes/{uid}): theirs alone.
   */
  async notesBetween(from: string, to: string): Promise<{ date: string; text: string }[]> {
    if (!seesOwnNotes(this.viewer)) return []
    const data = (await this.db.doc(`dateNotes/${this.viewer.uid}`).get()).data() ?? {}
    return Object.values(data)
      .filter(
        (n): n is { date: string; text: string; at?: number } =>
          !!n &&
          typeof n.date === 'string' &&
          typeof n.text === 'string' &&
          n.date >= from &&
          n.date <= to
      )
      .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? 0) - (b.at ?? 0))
      .map((n) => ({ date: n.date, text: n.text }))
  }

  /** Whether this person is on an event: named on it, or in one of its groups. */
  async isOn(ev: EventInstance): Promise<boolean> {
    return assignedTo(ev, await this.groups()).has(this.viewer.uid)
  }

  /** A task by id, if this person may see it. */
  async task(id: string): Promise<Task | null> {
    const t = (await this.tasks()).find((x) => x.id === id)
    return t && canSeeTask(t, this.viewer) ? t : null
  }

  private async avail(ev: EventInstance) {
    const [inst, series] = await Promise.all([
      this.db.doc(`avail/${availKey(ev)}`).get(),
      ev.isRec ? this.db.doc(`avail/${seriesAvailKey(ev.templateId)}`).get() : null,
    ])
    const responses = (s: Snapshot | null) =>
      (s?.data()?.responses ?? {}) as Record<string, AvailResponse>
    return { instance: responses(inst), series: responses(series) }
  }

  // --- The tools ------------------------------------------------------------

  async findEvents(query: string, date: string) {
    const [{ templates, overrides }, groups] = await Promise.all([this.eventData(), this.groups()])
    const found = findEvents(
      templates,
      overrides,
      groups,
      this.viewer,
      query,
      this.today,
      /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
    )
    const brief = (ev: EventInstance) => ({
      key: ev.instanceKey,
      title: ev.title,
      date: withWeekday(ev.date),
      startTime: ev.startTime || undefined,
      city: [ev.city, ev.state].filter(Boolean).join(', ') || undefined,
      past: ev.date < this.today || undefined,
    })
    if (found.length === 0) {
      const closest = closestEvents(templates, overrides, groups, this.viewer, query, this.today)
      return closest.length
        ? {
            found: [],
            closest: closest.map(brief),
            note: 'Nothing fits well. These are the nearest names this person can see.',
          }
        : { found: [], note: 'No event this person can see is anything like that.' }
    }
    // The one asked about is nearly always the first: its details come with
    // it, saving a round of asking for them. Not for a bare list of what's next.
    if (!query.trim() && !date) return { found: found.map(brief) }
    return { found: found.map(brief), details: await this.getEvent(found[0].instanceKey) }
  }

  async getEvent(key: string) {
    const ev = await this.event(key)
    if (!ev) return { error: 'No event this person can see has that key.' }
    const [names, avail, tasks] = await Promise.all([this.names(), this.avail(ev), this.tasks()])
    const own = effectiveResponse(ev, this.viewer.uid, avail.instance, avail.series)
    const food =
      ev.food && ev.foodItems?.length
        ? foodFor(
            ev,
            ((await this.db.doc(`foodSignups/${ev.templateId}_${ev.date}`).get()).data()?.signups ??
              {}) as Record<string, { uid: string; displayName?: string }>,
            this.viewer,
            names
          )
        : null
    const forThisEvent = tasks.filter(
      (t) =>
        canSeeTask(t, this.viewer) &&
        String(t.evTemplateId ?? '') === String(ev.templateId) &&
        (!t.evDate || t.evDate === ev.date)
    )
    // Cars set on its page for this date, when its form has none.
    const perDate =
      ev.carpool && !ev.carpoolCars?.length
        ? (((await this.db.doc(`carpool/${ev.templateId}_${ev.date}`).get()).data()?.cars ??
            []) as Car[])
        : null
    // A later day of a multi-day event carries its own date: its schedule names the first.
    const firstDay = /_d\d+$/.test(ev.instanceKey)
      ? (await this.eventData()).templates.find((t) => String(t.id) === String(ev.templateId))?.date
      : ev.date
    // A public follower is shown what its page shows them: when, where and its links.
    const team = seesTeamSide(this.viewer)
    const onIt = await this.isOn(ev)
    // Its private details — teams, dress code, schedule, cars, rooms,
    // flights — only for those on it, and admins (../eventPrivate).
    const inner = isAdminViewer(this.viewer) || (team && onIt)
    const reportTimes = reportTimesFor(ev, this.viewer, onIt)
    return {
      key: ev.instanceKey,
      title: ev.title,
      date: withWeekday(ev.date),
      startTime: ev.startTime || undefined,
      // Only for those on it, and admins: not to someone who can just see it.
      reportTimes: reportTimes.length ? reportTimesSaid(reportTimes) : undefined,
      venue: ev.location || undefined,
      address: [ev.address, ev.city, ev.state].filter(Boolean).join(', ') || undefined,
      virtualMeetingLink: ev.isVirtual ? ev.virtualLink || 'none given' : undefined,
      signUpLink: ev.signUpLink || undefined,
      privateDetails:
        team && !inner
          ? 'Its teams, dress code, report times, schedule, cars, rooms and flights are only for those on it, and this person is not.'
          : undefined,
      yourTeams: inner ? teamsOf(ev, this.viewer.uid).map((t) => t.name) : undefined,
      dressCode: inner ? dressCodeFor(ev, this.viewer) : undefined,
      schedule: inner && ev.schedule?.length ? scheduleFor(ev, firstDay) : undefined,
      food: team ? (food ?? undefined) : undefined,
      carpool:
        inner && ev.carpool
          ? {
              meetingPlace: ev.carpoolLoc || undefined,
              cars: carpoolFor(ev, this.viewer, names, perDate ?? undefined),
              // Where its cars are set: for this date on its page (set_carpool), or for every date in its form (edit_event).
              carsSet: perDate ? 'for this date, on its page' : 'for every date, in its form',
            }
          : undefined,
      flights: inner && ev.flights ? flightsFor(ev, this.viewer, names) : undefined,
      lodging: inner && ev.lodging ? lodgingFor(ev, this.viewer, names) : undefined,
      // Everything theirs at it, all together: "what are my responsibilities?".
      yours: team
        ? yoursAt(ev, this.viewer, names, {
            cars: inner ? ((perDate ?? ev.carpoolCars ?? []) as Car[]) : [],
            bringing: food?.mine ?? [],
            tasks: forThisEvent,
          })
        : undefined,
      yourAvailability: !team
        ? undefined
        : own
          ? `${AVAIL_LABELS[own.status]}${own.note ? ` — “${own.note}”` : ''}`
          : 'not answered',
      tasks: forThisEvent.map((t) => ({
        title: t.title,
        status: TASK_STATUS[t.status] ?? t.status,
        due: t.dueDate ? withWeekday(t.dueDate) : undefined,
        assignedTo: t.assignees.map((a) =>
          String(a) === this.viewer.uid ? 'you' : (names.get(String(a)) ?? 'someone')
        ),
      })),
    }
  }

  async weather(key: string) {
    const ev = await this.event(key)
    if (!ev) return { error: 'No event this person can see has that key.' }
    if (ev.isVirtual) return { note: 'It is a virtual event: there is no weather to give.' }
    // Its page shows the forecast to its team's members, not to a public follower.
    if (!seesTeamSide(this.viewer)) return { note: 'Its forecast is shown to its team members.' }
    const { _geocodeLat: lat, _geocodeLng: lng } = ev
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { note: 'Its page has no forecast: no city is set for it.' }
    }
    const daysAhead = Math.round(
      (Date.parse(`${ev.date}T00:00:00Z`) - Date.parse(`${this.today}T00:00:00Z`)) / 86400000
    )
    if (daysAhead < 0) return { note: 'It has already happened.' }
    if (daysAhead > FORECAST_DAYS) {
      return { note: `There is no forecast yet: forecasts reach ${FORECAST_DAYS} days ahead.` }
    }
    const forecast = await forecastFor(lat, lng, ev.date, daysAhead)
    return forecast
      ? {
          event: ev.title,
          date: withWeekday(ev.date),
          place: [ev.city, ev.state].filter(Boolean).join(', '),
          forecast,
        }
      : { note: 'The forecast could not be reached just now.' }
  }

  async availability(key: string) {
    const ev = await this.event(key)
    if (!ev) return { error: 'No event this person can see has that key.' }
    // Asked of its team's members on its page; a public follower is shown none of it.
    if (!seesTeamSide(this.viewer)) {
      return { event: ev.title, note: 'Its availability is asked of its team members.' }
    }
    const [groups, names, avail] = await Promise.all([this.groups(), this.names(), this.avail(ev)])
    const report = availabilityReport(ev, groups, names, avail.instance, avail.series, this.viewer)
    return isAdminViewer(this.viewer)
      ? { event: ev.title, date: withWeekday(ev.date), ...report }
      : {
          event: ev.title,
          yours: report.mine ?? 'not answered',
          note: 'Only admins can see other people’s availability.',
        }
  }

  async findTasks(query: string) {
    const [tasks, names, { templates }] = await Promise.all([
      this.tasks(),
      this.names(),
      this.eventData(),
    ])
    const found = findTasks(tasks, this.viewer, query)
    if (found.length === 0) return { found: [], note: 'No task this person can see matches.' }
    const titleOf = (id: unknown) => templates.find((t) => t.id === String(id))?.title
    return {
      found: found.map((t) => ({
        id: t.id,
        title: t.title,
        status: TASK_STATUS[t.status] ?? t.status,
        due: t.dueDate ? withWeekday(t.dueDate) : undefined,
        overdue: (t.dueDate && t.status !== 'done' && t.dueDate < this.today) || undefined,
        event: t.evTemplateId ? titleOf(t.evTemplateId) : undefined,
        assignedTo: t.assignees.map((a) =>
          String(a) === this.viewer.uid ? 'you' : (names.get(String(a)) ?? 'someone')
        ),
        lead: t.lead
          ? String(t.lead) === this.viewer.uid
            ? 'you'
            : names.get(String(t.lead))
          : undefined,
      })),
    }
  }
}
