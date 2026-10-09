import {
  availabilityReport,
  canSeeTask,
  carpoolFor,
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
  AVAIL_LABELS,
  availKey,
  seriesAvailKey,
  type AvailResponse,
  type EventInstance,
  type EventTemplate,
  type Group,
  type Task,
  type Viewer,
} from './data'

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

  private eventData() {
    this.events ??= this.db
      .collection('events')
      .get()
      .then((snap) => {
        const templates: EventTemplate[] = []
        const overrides: Record<string, Partial<EventTemplate>> = {}
        for (const d of snap.docs) {
          const { overrides: ov, ...t } = d.data() as EventTemplate & {
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
    if (found.length === 0) return { found: [], note: 'No event this person can see matches.' }
    return {
      found: found.map((ev) => ({
        key: ev.instanceKey,
        title: ev.title,
        date: withWeekday(ev.date),
        startTime: ev.startTime || undefined,
        city: [ev.city, ev.state].filter(Boolean).join(', ') || undefined,
        past: ev.date < this.today || undefined,
      })),
    }
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
    const myTeam = (ev.teams ?? []).find((t) =>
      [...t.leaders, ...t.members].some((m) => String(m) === this.viewer.uid)
    )
    return {
      key: ev.instanceKey,
      title: ev.title,
      date: withWeekday(ev.date),
      startTime: ev.startTime || undefined,
      reportTimes:
        ev.rtp || ev.rtm
          ? { production: ev.rtp || undefined, mission: ev.rtm || undefined }
          : undefined,
      venue: ev.location || undefined,
      address: [ev.address, ev.city, ev.state].filter(Boolean).join(', ') || undefined,
      virtualMeetingLink: ev.isVirtual ? ev.virtualLink || 'none given' : undefined,
      signUpLink: ev.signUpLink || undefined,
      yourTeam: myTeam?.name,
      dressCode: dressCodeFor(ev, this.viewer),
      food: food ?? undefined,
      carpool: ev.carpool
        ? {
            meetingPlace: ev.carpoolLoc || undefined,
            cars: carpoolFor(ev, this.viewer, names),
          }
        : undefined,
      flights: ev.flights ? flightsFor(ev, this.viewer, names) : undefined,
      lodging: ev.lodging ? lodgingFor(ev, this.viewer, names) : undefined,
      yourAvailability: own
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

  async availability(key: string) {
    const ev = await this.event(key)
    if (!ev) return { error: 'No event this person can see has that key.' }
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
