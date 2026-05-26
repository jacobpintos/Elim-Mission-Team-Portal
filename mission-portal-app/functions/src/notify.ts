import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { resend, RESEND_API_KEY } from './email/client'

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

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
  | 'eventRsvp'
  | 'taskComplete'

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

    // Write in-app notification to notifs/{uid}
    const notifMsg = inAppMessage(type, data)
    await admin
      .firestore()
      .doc(`notifs/${uid}`)
      .set(
        {
          items: admin.firestore.FieldValue.arrayUnion({
            id: nanoid(),
            msg: notifMsg,
            ts: Date.now(),
            type,
            read: false,
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

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

function inAppMessage(type: NotificationType, data: Record<string, unknown>): string {
  switch (type) {
    case 'newAssignment':
      return `You've been assigned a task: ${data.taskTitle ?? 'New task'}`
    case 'eventRsvp':
      return `${data.userName ?? 'Someone'} RSVP'd for ${data.eventTitle ?? 'an event'}`
    case 'taskComplete':
      return `Task completed: ${data.taskTitle ?? 'A task'}`
    case 'newMessage':
      return `New message in ${data.roomName ?? 'a room'}`
    case 'eventReminder':
      return `Reminder: ${data.eventTitle ?? 'An event'} is coming up`
    case 'announcement':
      return `New announcement: ${data.title ?? ''}`
    case 'issueAssigned':
      return `An issue was assigned to you: ${data.title ?? ''}`
    default:
      return 'New notification from Mission Portal'
  }
}

function subjectFor(type: NotificationType, _data: Record<string, unknown>): string {
  const subjects: Record<NotificationType, string> = {
    newAssignment: 'You have a new assignment — Mission Portal',
    newMessage: 'New message — Mission Portal',
    eventReminder: 'Event reminder — Mission Portal',
    announcement: 'New announcement — Mission Portal',
    issueAssigned: 'An issue was assigned to you — Mission Portal',
    eventRsvp: 'RSVP confirmation — Mission Portal',
    taskComplete: 'Task completed — Mission Portal',
  }
  return subjects[type] ?? 'Mission Portal notification'
}

function bodyFor(type: NotificationType, data: Record<string, unknown>): string {
  return `
    <p>You have a new notification from Mission Portal.</p>
    <p><strong>${inAppMessage(type, data)}</strong></p>
    <hr>
    <p style="color: #888; font-size: 12px;">
      You're receiving this because you have email notifications enabled for this event type.
      <br>
      <a href="#">Manage notification preferences</a>
    </p>
  `
}
