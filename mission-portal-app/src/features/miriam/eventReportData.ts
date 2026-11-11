import { deleteField, doc, FieldPath, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import { isAdmin } from '@/lib/roles'
import { alertsForDate, fetchNWSAlerts, fetchWeather } from '@/lib/weather'
import { seriesAvailKey } from '@/lib/availability'
import {
  buildEventReport,
  seenToDrop,
  type EventReport,
  type ReportAsk,
  type ReportSeen,
  type ReportTask,
  type ReportWeather,
} from '@/lib/eventReport'
import { useAuthStore } from '@/stores/authStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useUsersStore } from '@/stores/usersStore'
import {
  findEvents,
  type AvailResponse,
  type EventInstance,
  type Group,
} from '../../../functions/src/miriam/data'
import type { OutstandingSummary } from '../../../functions/src/reimbursements/logic'
import { eventsLoaded } from './hereNow'

/**
 * An admin's report on one event (lib/eventReport), gathered on the device
 * as they are signed in: the event, its tasks and who is on it from what the
 * app has loaded; its availability and what they last saw of it, read; the
 * reimbursement requests still open, counted by the server (functions:
 * eventReimbursements); and its forecast, as the event's page fetches it.
 * Each part on its own: one that can't be had is said so, never the report.
 */

/** Waited for a store to load, at most. */
const LOAD_WAIT_MS = 3000
/** A forecast, or the count of reimbursements, waited for at most. */
const WAIT_MS = 5000

const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([
    p.catch(() => fallback),
    new Promise<T>((done) => setTimeout(() => done(fallback), ms)),
  ])

async function loaded(ready: () => boolean) {
  const until = Date.now() + LOAD_WAIT_MS
  while (!ready() && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
}

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** An event as a report is given on: one date of it. */
export type ReportEvent = EventInstance

/** Whether this person may have event reports: admins. */
export const mayHaveReports = () => isAdmin(useAuthStore.getState().profile)

/**
 * The event asked about: on the day said, or by its name — the nearest
 * upcoming one that fits, or else the nearest past. Null when none fits.
 */
export async function eventForReport(ask: ReportAsk): Promise<EventInstance | null> {
  const data = await eventsLoaded()
  if (!data) return null
  const found = findEvents(
    data.templates,
    data.overrides,
    data.groups,
    data.viewer,
    ask.name,
    data.today,
    ask.date ?? '',
    6
  )
  if (ask.date || !ask.name) return found[0] ?? null
  return found.find((ev) => ev.date >= data.today) ?? found[0] ?? null
}

/** The event with this key, as the admin can see it. */
export async function eventByKeyForReport(key: string): Promise<EventInstance | null> {
  const date = /_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(key)?.[1] ?? ''
  const data = await eventsLoaded()
  if (!data || !date) return null
  return (
    findEvents(
      data.templates,
      data.overrides,
      data.groups,
      data.viewer,
      '',
      data.today,
      date,
      50
    ).find((ev) => ev.instanceKey === key) ?? null
  )
}

async function answersOf(key: string): Promise<Record<string, AvailResponse>> {
  const snap = await getDoc(doc(db, 'avail', key))
  return ((snap.data() as { responses?: Record<string, AvailResponse | null> } | undefined)
    ?.responses ?? {}) as Record<string, AvailResponse>
}

async function weatherFor(ev: EventInstance): Promise<ReportWeather | null> {
  if (ev.isVirtual || typeof ev._geocodeLat !== 'number' || typeof ev._geocodeLng !== 'number') {
    return { forecast: null, alerts: [] }
  }
  const lat = ev._geocodeLat
  const lng = ev._geocodeLng
  const [forecast, alerts] = await Promise.all([
    within(fetchWeather(lat, lng, ev.date), WAIT_MS, undefined),
    within(fetchNWSAlerts(lat, lng), WAIT_MS, []),
  ])
  // No answer in time, or none to be had: said so in the report.
  if (forecast === undefined) return null
  const named = [...new Set(alertsForDate(alerts, ev.date).map((a) => a.event))]
  return { forecast, alerts: named }
}

async function reimbursementsFor(
  ev: EventInstance
): Promise<(OutstandingSummary & { amounts: boolean }) | null> {
  const call = httpsCallable<
    { eventId: string; date: string | null },
    OutstandingSummary & { amounts: boolean }
  >(functions, 'eventReimbursements')
  const res = await within(
    call({ eventId: String(ev.templateId), date: ev.isRec ? ev.date : null }),
    WAIT_MS,
    null
  )
  return res?.data ?? null
}

/** What they last saw of each event, kept between reports. */
async function seenKept(uid: string): Promise<Record<string, ReportSeen> | null> {
  const snap = await getDoc(doc(db, 'reportSeen', uid))
  if (!snap.exists()) return null
  return ((snap.data() as { events?: Record<string, ReportSeen> }).events ?? {}) as Record<
    string,
    ReportSeen
  >
}

/** Kept for next time: this event's, and old ones let go (lib/eventReport seenToDrop). */
async function keepSeen(
  uid: string,
  kept: Record<string, ReportSeen> | null,
  key: string,
  seen: ReportSeen,
  today: string
) {
  const ref = doc(db, 'reportSeen', uid)
  if (!kept) {
    await setDoc(ref, { events: { [key]: seen } })
    return
  }
  const drop = seenToDrop({ ...kept, [key]: seen }, key, today)
  await updateDoc(
    ref,
    new FieldPath('events', key),
    seen,
    ...drop.flatMap((k) => [new FieldPath('events', k), deleteField()])
  )
}

/**
 * The report on this event, for the admin signed in — and what they saw of
 * its availability kept, for what changed next time. Null for anyone else.
 */
export async function gatherEventReport(ev: EventInstance): Promise<EventReport | null> {
  const profile = useAuthStore.getState().profile
  if (!profile || !isAdmin(profile)) return null
  const uid = String(profile.uid)
  const today = localToday()

  await Promise.all([
    loaded(() => !useTasksStore.getState().loading),
    loaded(() => useGroupsStore.getState().groups.length > 0),
  ])
  // As the app keys a date's availability (lib/availability availKey).
  const instanceKey = ev.instanceKey.replace(/\//g, '_')
  const [instance, series, kept, reimbursements, weather] = await Promise.all([
    within(answersOf(instanceKey), WAIT_MS, {}),
    ev.isRec ? within(answersOf(seriesAvailKey(ev.templateId)), WAIT_MS, {}) : {},
    within(seenKept(uid), WAIT_MS, null),
    reimbursementsFor(ev),
    weatherFor(ev),
  ])
  const report = buildEventReport({
    ev,
    tasks: useTasksStore.getState().tasks as unknown as ReportTask[],
    groups: useGroupsStore.getState().groups as unknown as Group[],
    instance,
    series,
    names: new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName])),
    seen: kept?.[ev.instanceKey] ?? null,
    reimbursements,
    weather,
    today,
    now: Date.now(),
  })
  // Not in the way of the report: kept next time instead, if not now.
  await keepSeen(uid, kept, ev.instanceKey, report.seen, today).catch(() => {})
  return report
}
