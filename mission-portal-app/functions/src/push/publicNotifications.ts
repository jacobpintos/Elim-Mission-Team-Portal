import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { sendExpoPush } from './expoPush'

if (!admin.apps.length) admin.initializeApp()

/** Collect Expo push tokens for public users who have a given pref enabled */
async function getPublicTokens(prefKey: 'publicAnnouncement' | 'publicEvent' | 'contentFeatured'): Promise<string[]> {
  const snap = await admin.firestore()
    .collection('users')
    .where('roles', 'array-contains', 'public')
    .get()

  const tokens: string[] = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (!data.notificationPrefs?.[prefKey]?.push) continue
    const pushTokens = data.pushTokens as Record<string, { token: string } | string | null> | undefined
    if (!pushTokens) continue
    for (const val of Object.values(pushTokens)) {
      const token = typeof val === 'string' ? val : val?.token
      if (token && token.startsWith('ExponentPushToken')) {
        tokens.push(token)
      }
    }
  }
  return tokens
}

/** Haversine distance in miles between two lat/lng points */
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Fires when a new announcement is published — notify public users if isPublic: true */
export const onAnnouncementPublished = onDocumentCreated('announcements/{id}', async (event) => {
  const data = event.data?.data()
  if (!data || !data.isPublic) return

  const tokens = await getPublicTokens('publicAnnouncement')
  if (!tokens.length) return

  const title = data.title ?? 'New Announcement'
  const body = data.body ?? ''
  await sendExpoPush(tokens, title, body, { type: 'publicAnnouncement', id: event.params.id })
  logger.info(`Public announcement "${title}" sent to ${tokens.length} token(s)`)
})

/** Fires when a new event is created — notify public users if isPublic: true and within radius (or virtual) */
export const onPublicEventCreated = onDocumentCreated('events/{id}', async (event) => {
  const data = event.data?.data()
  if (!data || !data.isPublic) return

  const isVirtual = !!data.isVirtual
  const eventLat = data.lat as number | undefined
  const eventLng = data.lng as number | undefined

  const snap = await admin.firestore()
    .collection('users')
    .where('roles', 'array-contains', 'public')
    .get()

  const tokens: string[] = []
  for (const doc of snap.docs) {
    const userData = doc.data()
    if (!userData.notificationPrefs?.publicEvent?.push) continue

    if (!isVirtual && eventLat !== undefined && eventLng !== undefined) {
      const loc = userData.locationPref as { lat?: number; lng?: number; radius?: number } | undefined
      if (loc?.lat !== undefined && loc?.lng !== undefined) {
        const dist = distanceMiles(loc.lat, loc.lng, eventLat, eventLng)
        if (dist > (loc.radius ?? 50)) continue
      }
    }

    const pushTokens = userData.pushTokens as Record<string, { token: string } | string | null> | undefined
    if (!pushTokens) continue
    for (const val of Object.values(pushTokens)) {
      const token = typeof val === 'string' ? val : val?.token
      if (token && token.startsWith('ExponentPushToken')) {
        tokens.push(token)
      }
    }
  }

  if (!tokens.length) return

  const title = data.title ?? 'New Event'
  const body = isVirtual ? 'New virtual event available' : `Event near you: ${data.title ?? ''}`
  await sendExpoPush(tokens, title, body, { type: 'publicEvent', id: event.params.id })
  logger.info(`Public event "${title}" sent to ${tokens.length} token(s)`)
})

/** Fires when music/db is updated — notify public users when new isNew or featured items are added */
export const onContentUpdated = onDocumentUpdated('music/db', async (event) => {
  const before = (event.data?.before.data()?.items ?? []) as Array<{ id: string; isNew?: boolean; featured?: boolean }>
  const after = (event.data?.after.data()?.items ?? []) as Array<{ id: string; isNew?: boolean; featured?: boolean }>

  const beforeIds = new Set(before.map((i) => i.id))
  const newItems = after.filter((i) => !beforeIds.has(i.id) && (i.isNew || i.featured))

  if (!newItems.length) return

  const tokens = await getPublicTokens('contentFeatured')
  if (!tokens.length) return

  const count = newItems.length
  const title = 'New Content Available'
  const body = count === 1 ? 'A new item has been added to Content.' : `${count} new items have been added to Content.`
  await sendExpoPush(tokens, title, body, { type: 'contentFeatured' })
  logger.info(`Content update sent to ${tokens.length} token(s) for ${count} new item(s)`)
})
