import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { sendExpoPush } from './push/expoPush'

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

export const weatherAlertCheck = onSchedule('0 */4 * * *', async () => {
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
    if (!t._geocodeLat || !t._geocodeLng) continue
    if (!isUpcomingInDays(t, todayStr, limitStr)) continue

    const locKey = `${t._geocodeLat.toFixed(3)},${t._geocodeLng.toFixed(3)}`
    if (!locMap.has(locKey)) {
      locMap.set(locKey, { lat: t._geocodeLat, lng: t._geocodeLng, eventDocs: [] })
    }
    locMap.get(locKey)!.eventDocs.push({ id: d.id, ...t })
  }

  if (locMap.size === 0) return

  // Load all non-public users with push tokens upfront
  const usersSnap = await db.collection('users').where('roles', 'array-contains-any', ['admin', 'security', 'regular', 'intern', 'merch', 'worship']).get()
  const memberTokenMap = new Map<string, string[]>()

  for (const d of usersSnap.docs) {
    const data = d.data()

    const tokens: string[] = []
    const pushTokens = data.pushTokens as Record<string, string | null> | undefined
    if (pushTokens) {
      for (const token of Object.values(pushTokens)) {
        if (typeof token === 'string' && token.startsWith('ExponentPushToken')) {
          tokens.push(token)
        }
      }
    }
    if (tokens.length > 0) memberTokenMap.set(d.id, tokens)
  }

  // Load groups for member resolution
  const groupsSnap = await db.collection('groups').get()
  const groupMembersMap = new Map<string, string[]>()
  for (const d of groupsSnap.docs) {
    const members = (d.data().members as (string | number)[] | undefined) ?? []
    groupMembersMap.set(d.id, members.map(String))
  }

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

        // Collect assigned user IDs
        const userIds = new Set<string>()
        const hasAssignees =
          (evDoc.users?.length ?? 0) > 0 ||
          (evDoc.groups?.length ?? 0) > 0 ||
          (evDoc.teams?.length ?? 0) > 0

        if (!hasAssignees) {
          // General event: notify all non-public members
          for (const uid of memberTokenMap.keys()) userIds.add(uid)
        } else {
          for (const uid of evDoc.users ?? []) userIds.add(String(uid))
          for (const gid of evDoc.groups ?? []) {
            for (const uid of groupMembersMap.get(String(gid)) ?? []) userIds.add(uid)
          }
          for (const team of evDoc.teams ?? []) {
            for (const uid of [...(team.leaders ?? []), ...(team.members ?? [])]) {
              userIds.add(String(uid))
            }
          }
        }

        // Gather tokens
        const tokens: string[] = []
        for (const uid of userIds) {
          for (const token of memberTokenMap.get(uid) ?? []) {
            tokens.push(token)
          }
        }

        if (tokens.length > 0) {
          const title = `⚠️ Weather Alert — ${evDoc.title ?? 'Upcoming Event'}`
          const body = `${alert.event}: ${alert.headline}`.slice(0, 178)
          await sendExpoPush(tokens, title, body, {
            type: 'weatherAlert',
            eventId: evDoc.id,
            alertId: alert.id,
          })
          logger.info(
            `Weather alert "${alert.event}" sent to ${tokens.length} token(s) for event "${evDoc.title ?? evDoc.id}"`
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
})
