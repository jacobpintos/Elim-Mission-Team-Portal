import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { RESEND_API_KEY } from './email/client'
import { notifyUser, type NotificationType } from './push/notifyCore'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

interface NotificationPayload {
  uid: string
  type: NotificationType
  data: Record<string, unknown>
}

export const sendNotification = onCall({ secrets: [RESEND_API_KEY] }, async (req) => {
  const { uid, type, data } = req.data as NotificationPayload

  if (!req.auth) {
    throw new Error('unauthenticated')
  }

  const userSnap = await admin.firestore().doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    throw new Error('user-not-found')
  }

  logger.info(`sendNotification: uid=${uid} type=${type}`)
  await notifyUser(uid, type, data)

  return { ok: true }
})
