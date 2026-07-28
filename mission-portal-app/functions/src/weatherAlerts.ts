import { onSchedule } from 'firebase-functions/v2/scheduler'
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
  expires: string
}

interface NWSFeatureRaw {
  id?: string
  properties: {
    id?: string
    event?: string
    severity?: string
    headline?: string
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

interface EventTemplateRaw {
  isRec?: boolean
  date?: string
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

function isUpcomingInDays(t: EventTemplateRaw, todayStr: string, limitStr: string): boolean {
  if (t.isVirtual) return false
  if (!t._geocodeLat || !t._geocodeLng) return false

  if (t.recEnd && t.recEnd < todayStr) return false

  if (!t.isRec) {
    return !!(t.date && t.date >= todayStr && t.date <= limitStr)
  }

  if (t.recur === 'monthly') return true

  if (t.recDay === undefined) return true

  const step = t.recur === 'biweekly' ? 14 : 7
  const today = new Date(todayStr + 'T00:00:00Z')
  const limit = new Date(limitStr + 'T00:00:00Z')

  let d = new Date(today)
  while (d.getUTCDay() !== t.recDay) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  if (d <= limit) return true

  if (step === 14) {
    d.setUTCDate(d.getUTCDate() + 7)
    return d <= limit
  }

  return false
}

export const weatherAlertCheck = onSchedule(
  { schedule: '0 */4 * * *', secrets: [RESEND_API_KEY] },
  async () => {
  const db = admin.firestore()
  const todayStr = todayUTCStr()
  const limitStr = addDaysStr(todayStr, 7)

  // Load all events and filter to upcoming events with geocoords
  const eventsSnap = await db.collection('events').get()

  // Deduplicate locations to minimize NWS API calls
  const locMap = new Map<
    string,
    { lat: number; lng: number; eventDocs: Array<{ id: string } & EventTemplateRaw> }
  >()

  for (const d of eventsSnap.docs) {
    const t = d.data() as EventTemplateRaw
    const templateDoc = { id: d.id, ...t }

    // Template-level location
    if (t._geocodeLat && t._geocodeLng && isUpcomingInDays(t, todayStr, limitStr)) {
      const locKey = `${t._geocodeLat.toFixed(3)},${t._geocodeLng.toFixed(3)}`
      if (!locMap.has(locKey)) {
        locMap.set(locKey, { lat: t._geocodeLat, lng: t._geocodeLng, eventDocs: [] })
      }
      locMap.get(locKey)!.eventDocs.push(templateDoc)
    }

    // Per-instance location overrides (recurring only)
    if (t.isRec && t.overrides) {
      for (const [instanceKey, ov] of Object.entries(t.overrides)) {
        if (ov.deleted) continue
        if (!ov._geocodeLat || !ov._geocodeLng) continue
        // Confirm this instance date falls within the alert window
        const parts = instanceKey.split('_')
        const instanceDate = parts[parts.length - 1]
        if (!instanceDate || instanceDate < todayStr || instanceDate > limitStr) continue
        // Skip if location is same as template (already handled above)
        if (ov._geocodeLat === t._geocodeLat && ov._geocodeLng === t._geocodeLng) continue
        const locKey = `${ov._geocodeLat.toFixed(3)},${ov._geocodeLng.toFixed(3)}`
        if (!locMap.has(locKey)) {
          locMap.set(locKey, { lat: ov._geocodeLat, lng: ov._geocodeLng, eventDocs: [] })
        }
        // Merge template + override so notification targets the right users
        locMap.get(locKey)!.eventDocs.push({ ...templateDoc, ...ov, id: instanceKey })
      }
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

  // For each location, fetch NWS alerts and notify
  for (const [, { lat, lng, eventDocs }] of locMap) {
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
        expires: f.properties?.expires ?? '',
      }))
    } catch {
      continue
    }

    for (const alert of rawAlerts) {
      if (!alert.id) continue

      for (const evDoc of eventDocs) {
        const sentDocId = `${alert.id.replace(/\//g, '_')}_${evDoc.id}`
        const sentRef = db.doc(`weatherAlertsSent/${sentDocId}`)
        const sentSnap = await sentRef.get()
        if (sentSnap.exists) continue

        for (const uid of adminUids) {
          await notifyUser(uid, 'weatherAlertAdmin', {
            eventTitle: evDoc.title ?? 'Upcoming Event',
            alertEvent: alert.event,
            headline: alert.headline,
            eventId: evDoc.id,
            alertId: alert.id,
          })
        }
        if (adminUids.length > 0) {
          logger.info(
            `Weather alert "${alert.event}" sent to ${adminUids.length} admin(s) for event "${evDoc.title ?? evDoc.id}"`
          )
        }

        await sentRef.set({
          alertId: alert.id,
          eventId: evDoc.id,
          alertEvent: alert.event,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          expires: alert.expires,
        })
      }
    }
  }

  // Prune sent records older than 7 days
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
)
