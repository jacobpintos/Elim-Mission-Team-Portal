import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { resend, RESEND_API_KEY } from './email/client'

// Initialize Firebase Admin (safe to call multiple times — idempotent)
if (admin.apps.length === 0) {
  admin.initializeApp()
}

type NotificationType =
  | 'newAssignment'
  | 'newMessage'
  | 'eventReminder'
  | 'announcement'
  | 'issueAssigned'

interface NotificationPayload {
  uid: string
  type: NotificationType
  data: Record<string, unknown>
}

export const sendNotification = onCall(
  { secrets: [RESEND_API_KEY] },
  async (req) => {
    const { uid, type, data } = req.data as NotificationPayload

    // Verify caller is authenticated
    if (!req.auth) {
      throw new Error('unauthenticated')
    }

    const userSnap = await admin.firestore().doc(`users/${uid}`).get()
    const profile = userSnap.data()
    if (!profile) {
      throw new Error('user-not-found')
    }

    const prefs = profile.notificationPrefs?.[type]
    logger.info(`sendNotification: uid=${uid} type=${type} emailPref=${prefs?.email}`)

    // PHASE 1: email-only branch
    if (prefs?.email && profile.email) {
      await resend().emails.send({
        from: 'Mission Portal <noreply@yourdomain.com>',
        to: profile.email as string,
        subject: subjectFor(type, data),
        html: bodyFor(type, data),
      })
      logger.info(`Email sent to ${profile.email as string} for ${type}`)
    }

    // PHASE 6 STUB: push branch
    // if (prefs?.push) { await sendPushToTokens(profile.pushTokens, type, data) }

    return { ok: true }
  }
)

function subjectFor(type: NotificationType, _data: Record<string, unknown>): string {
  const subjects: Record<NotificationType, string> = {
    newAssignment: 'You have a new assignment — Mission Portal',
    newMessage: 'New message — Mission Portal',
    eventReminder: 'Event reminder — Mission Portal',
    announcement: 'New announcement — Mission Portal',
    issueAssigned: 'An issue was assigned to you — Mission Portal',
  }
  return subjects[type] ?? 'Mission Portal notification'
}

function bodyFor(type: NotificationType, data: Record<string, unknown>): string {
  return `
    <p>You have a new notification from Mission Portal.</p>
    <p><strong>Type:</strong> ${type}</p>
    <pre>${JSON.stringify(data, null, 2)}</pre>
    <hr>
    <p style="color: #888; font-size: 12px;">
      You're receiving this because you have email notifications enabled for this event type.
      <br>
      <a href="#">Manage notification preferences</a>
    </p>
  `
}
