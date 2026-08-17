import { onCall } from 'firebase-functions/v2/https'
import { requireAdmin } from '../owner'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { sendExpoPush } from './expoPush'

export const broadcastAnnouncement = onCall(async (req) => {
  // Was `req.auth?.token.admin`, a custom claim nothing in this project ever
  // sets — so this refused everyone, admins included. Roles live in Firestore.
  await requireAdmin(req.auth?.uid)

  const { title, body, link } = req.data as {
    title: string
    body: string
    link?: string
  }

  // Collect all Expo push tokens from users who have push enabled for announcements
  const usersSnap = await admin.firestore().collection('users').get()
  const tokens: string[] = []
  for (const snap of usersSnap.docs) {
    const data = snap.data()
    if (!data.notificationPrefs?.announcement?.push) continue
    const pushTokens = data.pushTokens as Record<string, string | null> | undefined
    if (!pushTokens) continue
    for (const token of Object.values(pushTokens)) {
      if (typeof token === 'string' && token.startsWith('ExponentPushToken')) {
        tokens.push(token)
      }
    }
  }

  if (tokens.length > 0) {
    await sendExpoPush(tokens, title, body, { type: 'announcement', link: link ?? '' })
    logger.info(`Broadcast announcement "${title}" to ${tokens.length} token(s)`)
  }

  return { ok: true }
})
