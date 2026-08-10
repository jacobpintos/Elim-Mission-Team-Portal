import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from './email/client'
import { notifyUser } from './push/notifyCore'

if (!admin.apps.length) admin.initializeApp()

interface NWSAlertRaw {
  id: string
  event: string
  severity: string
  headline: string
  /** Start of the alert's window. Without it an alert cannot be placed in time. */
  effective: string
  expires: string
}

interface NWSFeatureRaw {
  id?: string
  properties: {
    id?: string
    event?: string
    severity?: string
    headline?: string
    effective?: string
    expires?: string
  }
}

interface EventTeamRaw {
  leaders?: (string | number)[]
  members?: (string | number)[]
}

interface EventOverrideRaw {
  deleted?: boolean
  isVirtual?: boolean
  _geocodeLat?: number
  _geocodeLng?: number
  title?: string
  users?: (string | number)[]
  groups?: string[]
  teams?: EventTeamRaw[]
}

interface ExtraDayRaw {
  date?: string
}

interface EventTemplateRaw {
  isRec?: boolean
  date?: string
  /** Further days of a multi-day event, each with its own date. */
  extraDays?: ExtraDayRaw[]
  recDay?: number
  recur?: string
  recEnd?: string | null
  isVirtual?: boolean
  _geocodeLat?: number
  _geocodeLng?: number
  title?: string
  users?: (string | number)[]
  groups?: string[]
  teams?: EventTeamRaw[]
  overrides?: Record<string, EventOverrideRaw>
}

function todayUTCStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * The days this event actually happens on, within the alert window.
 *
 * Used to be a yes/no "is this event coming up", which was enough to decide
 * whether to look at the weather but not enough to decide whether a given
 * alert was relevant — so every alert active anywhere near the venue was sent,
 * including ones whose own window covered a day the event does not fall on.
 * Returning the dates lets each alert be checked against them.
 *
 * The stepping mirrors getInstances() in src/lib/events.ts: anchor to recDay,
 * then step by the recurrence, stopping at recEnd.
 */
export function upcomingDates(
  t: EventTemplateRaw,
  fromStr: string,
  limitStr: string
): string[] {
  if (t.isVirtual) return []
  if (!t._geocodeLat || !t._geocodeLng) return []
  if (t.recEnd && t.recEnd < fromStr) return []

  const inWindow = (d?: string): boolean => !!d && d >= fromStr && d <= limitStr

  if (!t.isRec) {
    // A multi-day event happens on all of its days. Only the first was
    // considered before, so an alert covering day three was never matched and
    // the later days of a trip went unchecked entirely.
    const days = [t.date, ...(t.extraDays ?? []).map((e) => e.date)].filter(inWindow) as string[]
    return [...new Set(days)].sort()
  }

  const limit = t.recEnd && t.recEnd < limitStr ? t.recEnd : limitStr
  if (limit < fromStr) return []

  const step = t.recur === 'biweekly' ? 14 : t.recur === 'monthly' ? 30 : 7
  const d = new Date(fromStr + 'T00:00:00Z')
  const end = new Date(limit + 'T00:00:00Z')

  // An event with no weekday set has no occurrence to place, so nothing is
  // claimed for it rather than claiming every day.
  if (t.recDay === undefined) return []
  while (d.getUTCDay() !== t.recDay) d.setUTCDate(d.getUTCDate() + 1)

  const dates: string[] = []
  let n = 0
  while (d <= end && n < 60) {
    dates.push(d.toISOString().split('T')[0])
    d.setUTCDate(d.getUTCDate() + step)
    n++
  }
  return dates
}

/**
 * Does this alert's own window cover the given day?
 *
 * Mirrors alertCoversDate() in src/lib/weather.ts, which decides whether the
 * alert is shown on an event card. The two have to agree: a push about an
 * alert the card will not show sends people looking for something that is not
 * there. functions/ is a separate TypeScript project and cannot import from
 * the app, so they are kept in step by hand.
 */
export function alertCoversDate(
  alert: { effective?: string; expires?: string },
  eventDate: string
): boolean {
  if (!eventDate) return false

  const day = (iso?: string): string | null => {
    if (!iso) return null
    const ts = Date.parse(iso)
    return Number.isNaN(ts) ? null : new Date(ts).toISOString().split('T')[0]
  }

  const from = day(alert.effective)
  const to = day(alert.expires)

  // An alert with no window at all cannot be placed, so it is sent rather than
  // dropped — a warning missed is worse than one sent early.
  if (!from && !to) return true

  if (from && eventDate < from) return false
  if (to && eventDate > to) return false
  return true
}

/**
 * The days either side of now that count as "happening around now".
 *
 * A day either side covers every timezone's version of today: at 7pm Central
 * the UTC date has already rolled over, and at 6am it has not yet caught up
 * with events later that evening elsewhere. Which alerts are actually sent is
 * still decided by whether the alert's window covers one of the event's days,
 * so being generous here costs nothing.
 */
export function nowWindow(todayStr: string): { fromStr: string; limitStr: string } {
  return { fromStr: addDaysStr(todayStr, -1), limitStr: addDaysStr(todayStr, 1) }
}

/** The lookahead window: the same reach back, plus a week of warning. */
export function aheadWindow(todayStr: string): { fromStr: string; limitStr: string } {
  return { fromStr: addDaysStr(todayStr, -1), limitStr: addDaysStr(todayStr, 7) }
}

/** One venue that needs watching on one day. */
export interface WatchEntry {
  /** Event id, or the instance key when a single occurrence was moved. */
  id: string
  title: string
  lat: number
  lng: number
}

/** day → the venues to watch that day. */
export type WatchDays = Record<string, WatchEntry[]>

interface WatchDoc {
  days?: WatchDays
  builtFor?: string
}

/**
 * The watch list.
 *
 * One small document saying which venues need watching on which days. The
 * five-minute run reads this and nothing else, so a day with no event costs
 * exactly one document read — which is what makes that cadence affordable.
 * Working it out from the events collection every five minutes cost one read
 * per event per run instead.
 */
const WATCH_DOC = 'config/weatherWatch'

/**
 * Turn events into the day → venue list.
 *
 * Only days inside the window are kept, and the window never starts before
 * today, so a finished event is never watched. A day either side of the UTC
 * date is still allowed, because at 7pm Central the UTC date has already
 * rolled over and this evening's event would otherwise look like yesterday's.
 */
export function buildWatchDays(
  events: Array<{ id: string } & EventTemplateRaw>,
  fromStr: string,
  limitStr: string
): WatchDays {
  const days: WatchDays = {}
  const add = (date: string, entry: WatchEntry) => {
    const list = (days[date] ??= [])
    if (!list.some((e) => e.id === entry.id)) list.push(entry)
  }

  for (const t of events) {
    if (t._geocodeLat && t._geocodeLng) {
      for (const date of upcomingDates(t, fromStr, limitStr)) {
        add(date, {
          id: t.id,
          title: t.title ?? 'Upcoming Event',
          lat: t._geocodeLat,
          lng: t._geocodeLng,
        })
      }
    }

    // A single occurrence moved to another venue is watched at that venue.
    if (t.isRec && t.overrides) {
      for (const [instanceKey, ov] of Object.entries(t.overrides)) {
        if (ov.deleted) continue
        if (!ov._geocodeLat || !ov._geocodeLng) continue
        if (ov._geocodeLat === t._geocodeLat && ov._geocodeLng === t._geocodeLng) continue
        const instanceDate = instanceKey.split('_').pop()
        if (!instanceDate || instanceDate < fromStr || instanceDate > limitStr) continue
        add(instanceDate, {
          id: instanceKey,
          title: ov.title ?? t.title ?? 'Upcoming Event',
          lat: ov._geocodeLat,
          lng: ov._geocodeLng,
        })
      }
    }
  }
  return days
}

/**
 * Work the watch list out afresh and store it.
 *
 * Runs when an event changes and on the four-hourly sweep, so it is current
 * without being recomputed on a timer. The dated query reaches back a month
 * only to find a multi-day event that is still running — no day before today
 * survives buildWatchDays, so nothing in the past is ever watched.
 */
export async function rebuildWatch(): Promise<WatchDays> {
  const db = admin.firestore()
  const todayStr = todayUTCStr()
  const { fromStr, limitStr } = aheadWindow(todayStr)

  const [datedSnap, recurringSnap] = await Promise.all([
    db
      .collection('events')
      .where('date', '>=', addDaysStr(fromStr, -30))
      .where('date', '<=', limitStr)
      .get(),
    db.collection('events').where('isRec', '==', true).get(),
  ])

  const byId = new Map<string, { id: string } & EventTemplateRaw>()
  for (const d of [...datedSnap.docs, ...recurringSnap.docs]) {
    byId.set(d.id, { id: d.id, ...(d.data() as EventTemplateRaw) })
  }

  const days = buildWatchDays([...byId.values()], fromStr, limitStr)
  await db.doc(WATCH_DOC).set({
    days,
    builtFor: todayStr,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return days
}

/**
 * Look up the weather for the venues being watched and notify on what matters.
 *
 * Shared by both schedules. They differ only in how far ahead they look: one
 * watches the days around now, often; the other looks a week out, occasionally.
 * The record kept in weatherAlertsSent means an alert seen by both is still
 * only sent once.
 */
async function runWeatherCheck(
  days: WatchDays,
  fromStr: string,
  limitStr: string,
  options: { prune?: boolean } = {}
): Promise<void> {
  const db = admin.firestore()

  // One entry per venue, carrying the days it is being watched for — so an
  // alert is checked against those days rather than sent for merely being
  // active nearby.
  const locMap = new Map<
    string,
    { lat: number; lng: number; watched: Map<string, WatchEntry & { dates: string[] }> }
  >()

  for (const [date, entries] of Object.entries(days)) {
    if (date < fromStr || date > limitStr) continue
    for (const entry of entries) {
      const locKey = `${entry.lat.toFixed(3)},${entry.lng.toFixed(3)}`
      if (!locMap.has(locKey)) {
        locMap.set(locKey, { lat: entry.lat, lng: entry.lng, watched: new Map() })
      }
      const watched = locMap.get(locKey)!.watched
      const existing = watched.get(entry.id)
      if (existing) existing.dates.push(date)
      else watched.set(entry.id, { ...entry, dates: [date] })
    }
  }

  if (locMap.size === 0) return

  // Weather alerts are an ADMIN-facing notification: rather than alerting
  // everyone assigned to the event, notify admins so they can decide how to
  // respond. Delivery goes through notifyUser so it respects each admin's
  // prefs and participates in the batching window.
  const adminsSnap = await db
    .collection('users')
    .where('roles', 'array-contains', 'admin')
    .get()
  const adminUids = adminsSnap.docs.map((d) => d.id)

  for (const [, { lat, lng, watched }] of locMap) {
    let rawAlerts: NWSAlertRaw[] = []
    try {
      const res = await fetch(
        `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`,
        { headers: { 'User-Agent': 'MissionPortalApp/1.0' } }
      )
      if (!res.ok) continue
      const json = (await res.json()) as { features?: NWSFeatureRaw[] }
      rawAlerts = (json.features ?? []).map((f) => ({
        id: f.id ?? f.properties?.id ?? '',
        event: f.properties?.event ?? '',
        severity: f.properties?.severity ?? 'Unknown',
        headline: f.properties?.headline ?? '',
        effective: f.properties?.effective ?? '',
        expires: f.properties?.expires ?? '',
      }))
    } catch {
      continue
    }

    for (const alert of rawAlerts) {
      if (!alert.id) continue

      for (const entry of watched.values()) {
        // An alert active at the venue used to be sent whatever days it
        // covered, so one running today reached admins about an event next
        // week — a warning about a day with no event on it.
        const covered = entry.dates.find((d) => alertCoversDate(alert, d))
        if (!covered) continue

        const sentDocId = `${alert.id.replace(/\//g, '_')}_${entry.id}`
        const sentRef = db.doc(`weatherAlertsSent/${sentDocId}`)
        const sentSnap = await sentRef.get()
        if (sentSnap.exists) continue

        for (const uid of adminUids) {
          await notifyUser(uid, 'weatherAlertAdmin', {
            eventTitle: entry.title,
            alertEvent: alert.event,
            headline: alert.headline,
            eventDate: covered,
            eventId: entry.id,
            alertId: alert.id,
          })
        }
        if (adminUids.length > 0) {
          logger.info(
            `Weather alert "${alert.event}" sent to ${adminUids.length} admin(s) for event "${entry.title}"`
          )
        }

        await sentRef.set({
          alertId: alert.id,
          eventId: entry.id,
          alertEvent: alert.event,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          expires: alert.expires,
        })
      }
    }
  }

  // Prune sent records older than 7 days.
  //
  // Only on the lookahead run: this is a query of up to 500 documents and
  // there is no reason to pay for it every five minutes when once every four
  // hours clears the backlog just as well.
  if (!options.prune) return

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const oldSnap = await db
    .collection('weatherAlertsSent')
    .where('sentAt', '<', sevenDaysAgo)
    .limit(500)
    .get()
  if (!oldSnap.empty) {
    const batch = db.batch()
    oldSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * The lookahead: a week out, four times a day.
 *
 * The "there is a storm coming on Saturday" half — useful for deciding whether
 * to move an event, and not urgent enough to poll for. Rebuilds the watch list
 * as it goes, which also rolls it forward as days pass.
 */
export const weatherAlertCheck = onSchedule(
  { schedule: '0 */4 * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const days = await rebuildWatch()
    const { fromStr, limitStr } = aheadWindow(todayUTCStr())
    await runWeatherCheck(days, fromStr, limitStr, { prune: true })
  }
)

/**
 * The live watch: only the days around now, every five minutes.
 *
 * A tornado warning issued during an event is what this exists for, and
 * finding out an hour later is no use.
 *
 * It reads the watch list and nothing else, so a day with no event costs one
 * document read and makes no weather calls at all. The heavy work only happens
 * on the days there is something to watch.
 */
export const weatherAlertNow = onSchedule(
  { schedule: '*/5 * * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const { fromStr, limitStr } = nowWindow(todayUTCStr())
    const snap = await admin.firestore().doc(WATCH_DOC).get()
    const days = (snap.data() as WatchDoc | undefined)?.days ?? {}
    if (!Object.keys(days).some((d) => d >= fromStr && d <= limitStr)) return
    await runWeatherCheck(days, fromStr, limitStr)
  }
)

/**
 * Keep the watch list current.
 *
 * An event created or rescheduled today has to be watched today, so the list
 * is rebuilt when one changes rather than waiting up to four hours for the
 * next sweep.
 */
export const onEventWrittenWeather = onDocumentWritten('events/{eventId}', async () => {
  await rebuildWatch()
})
