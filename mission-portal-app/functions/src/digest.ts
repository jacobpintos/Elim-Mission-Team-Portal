import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { Resend } from 'resend'
import * as crypto from 'crypto'

if (!admin.apps.length) admin.initializeApp()

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const UNSUBSCRIBE_HMAC_SECRET = process.env.UNSUBSCRIBE_HMAC_SECRET ?? ''
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL ?? 'https://us-central1-yourproject.cloudfunctions.net'

interface UserDoc {
  uid: string
  email: string
  displayName: string
  roles: string[]
  notificationPrefs?: {
    weeklyDigest?: boolean
    monthlyDigest?: boolean
  }
}

interface DigestSubscriberDoc {
  uid: string
  email: string
  displayName: string
  type: 'weekly' | 'monthly'
}

interface EventDoc {
  title?: string
  date?: string
  location?: string
  startTime?: string
}

interface AnnouncementDoc {
  title?: string
  body?: string
  ts?: number
}

interface DigestContent {
  events: EventDoc[]
  announcements: AnnouncementDoc[]
}

function buildUnsubscribeToken(uid: string, type: string): string {
  return crypto.createHmac('sha256', UNSUBSCRIBE_HMAC_SECRET).update(`${uid}:${type}`).digest('hex')
}

function buildUnsubscribeUrl(uid: string, type: string): string {
  const token = buildUnsubscribeToken(uid, type)
  return `${FUNCTIONS_BASE_URL}/unsubscribe?uid=${uid}&type=${type}&token=${token}`
}

async function getDigestRecipients(type: 'weekly' | 'monthly'): Promise<UserDoc[]> {
  const db = admin.firestore()
  const snap = await db
    .collection('digestSubscribers')
    .where('type', '==', type)
    .get()
  return snap.docs
    .map((d) => d.data() as DigestSubscriberDoc)
    .filter((u) => !!u.email)
    .map((u) => ({ uid: u.uid, email: u.email, displayName: u.displayName, roles: [] }))
}

async function gatherDigestContent(db: admin.firestore.Firestore): Promise<DigestContent> {
  const now = new Date()
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const nowStr = now.toISOString().slice(0, 10)
  const twoWeeksStr = twoWeeksLater.toISOString().slice(0, 10)

  // Fetch upcoming events (next 2 weeks)
  let events: EventDoc[] = []
  try {
    const eventsSnap = await db
      .collection('events')
      .where('date', '>=', nowStr)
      .where('date', '<=', twoWeeksStr)
      .orderBy('date')
      .limit(10)
      .get()
    events = eventsSnap.docs.map((d) => d.data() as EventDoc)
  } catch {
    events = []
  }

  // Fetch recent announcements (last 7 days)
  let announcements: AnnouncementDoc[] = []
  try {
    const announcementsSnap = await db
      .collection('announcements')
      .where('ts', '>=', sevenDaysAgo.getTime())
      .orderBy('ts', 'desc')
      .limit(5)
      .get()
    announcements = announcementsSnap.docs.map((d) => d.data() as AnnouncementDoc)
  } catch {
    announcements = []
  }

  return { events, announcements }
}

function buildWeeklyEmailHtml(
  name: string,
  events: EventDoc[],
  announcements: AnnouncementDoc[],
  unsubUrl: string
): string {
  const eventsHtml =
    events.length > 0
      ? events
          .map(
            (e) =>
              `<tr>
                <td style="padding:8px 0;border-bottom:1px solid #eee">
                  <strong>${e.title ?? 'Event'}</strong><br>
                  <span style="color:#888;font-size:13px">${e.date ?? ''} ${e.startTime ?? ''} ${e.location ? '— ' + e.location : ''}</span>
                </td>
              </tr>`
          )
          .join('')
      : '<tr><td style="padding:8px 0;color:#888">No upcoming events this week</td></tr>'

  const announcementsHtml =
    announcements.length > 0
      ? announcements
          .map(
            (a) =>
              `<div style="margin-bottom:16px;padding:12px;background:#f9f9f9;border-radius:6px">
                <strong>${a.title ?? 'Announcement'}</strong>
                <p style="margin:8px 0 0;color:#555;font-size:14px">${a.body ?? ''}</p>
              </div>`
          )
          .join('')
      : '<p style="color:#888">No recent announcements</p>'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Weekly Digest</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#e8624a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:24px">Weekly Digest</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">The Well of Iowa</p>
  </div>
  <div style="background:#f5f5f5;padding:20px;border-radius:0 0 8px 8px">
    <p>Hi ${name},</p>
    <p>Here's your weekly update from The Well of Iowa.</p>

    <h2 style="color:#e8624a;font-size:18px">Upcoming Events</h2>
    <table style="width:100%;border-collapse:collapse">
      ${eventsHtml}
    </table>

    <h2 style="color:#e8624a;font-size:18px;margin-top:24px">Recent Announcements</h2>
    ${announcementsHtml}

    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#aaa;text-align:center">
      You're receiving this weekly digest from The Well of Iowa.<br>
      <a href="${unsubUrl}" style="color:#aaa">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

function buildMonthlyEmailHtml(
  name: string,
  events: EventDoc[],
  announcements: AnnouncementDoc[],
  unsubUrl: string
): string {
  const eventsHtml =
    events.length > 0
      ? events
          .map(
            (e) =>
              `<li style="margin-bottom:8px">
                <strong>${e.title ?? 'Event'}</strong> — ${e.date ?? ''} ${e.startTime ?? ''}
              </li>`
          )
          .join('')
      : '<li style="color:#888">No upcoming events</li>'

  const announcementsHtml =
    announcements.length > 0
      ? announcements
          .map(
            (a) =>
              `<div style="margin-bottom:12px">
                <strong>${a.title ?? 'Announcement'}</strong>
                <p style="margin:4px 0;color:#555;font-size:14px">${a.body ?? ''}</p>
              </div>`
          )
          .join('')
      : '<p style="color:#888">No announcements this month</p>'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Monthly Digest</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#e8624a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:24px">Monthly Newsletter</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">The Well of Iowa</p>
  </div>
  <div style="background:#f5f5f5;padding:20px;border-radius:0 0 8px 8px">
    <p>Hi ${name},</p>
    <p>Here's your monthly update from The Well of Iowa.</p>

    <h2 style="color:#e8624a;font-size:18px">Upcoming Events</h2>
    <ul>
      ${eventsHtml}
    </ul>

    <h2 style="color:#e8624a;font-size:18px;margin-top:24px">Announcements</h2>
    ${announcementsHtml}

    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#aaa;text-align:center">
      You're receiving this monthly newsletter from The Well of Iowa.<br>
      <a href="${unsubUrl}" style="color:#aaa">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

async function sendDigestBatch(
  recipients: UserDoc[],
  type: 'weekly' | 'monthly',
  content: DigestContent,
  db: admin.firestore.Firestore
): Promise<void> {
  const resend = new Resend(RESEND_API_KEY)
  const batchId = `${type}-${Date.now()}`
  const CHUNK_SIZE = 100

  let totalDelivered = 0
  let totalBounced = 0

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    const emails = chunk.map((user) => {
      const unsubUrl = buildUnsubscribeUrl(user.uid, type)
      const html =
        type === 'weekly'
          ? buildWeeklyEmailHtml(user.displayName, content.events, content.announcements, unsubUrl)
          : buildMonthlyEmailHtml(user.displayName, content.events, content.announcements, unsubUrl)

      return {
        from: 'The Well of Iowa <noreply@thewellofiowa.org>',
        to: user.email,
        subject:
          type === 'weekly'
            ? 'Your Weekly Digest — The Well of Iowa'
            : 'Monthly Newsletter — The Well of Iowa',
        html,
        tags: [{ name: 'batchId', value: batchId }],
      }
    })

    try {
      await resend.batch.send(emails)
      totalDelivered += chunk.length
    } catch {
      totalBounced += chunk.length
    }
  }

  // Write digest stats
  await db.collection('digestStats').add({
    type,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    recipients: recipients.length,
    delivered: totalDelivered,
    bounced: totalBounced,
    opened: 0,
    batchId,
  })
}

// Scheduled: Weekly — Monday 8am Central = 13:00 UTC
export const weeklyDigest = onSchedule('0 13 * * 1', async () => {
  const db = admin.firestore()
  const recipients = await getDigestRecipients('weekly')
  if (recipients.length === 0) return
  const content = await gatherDigestContent(db)
  await sendDigestBatch(recipients, 'weekly', content, db)
})

// Scheduled: Monthly — 1st of month 8am Central = 13:00 UTC
export const monthlyDigest = onSchedule('0 13 1 * *', async () => {
  const db = admin.firestore()
  const recipients = await getDigestRecipients('monthly')
  if (recipients.length === 0) return
  const content = await gatherDigestContent(db)
  await sendDigestBatch(recipients, 'monthly', content, db)
})

// Manual callable — admin only
export const sendDigestManual = onCall(async (req) => {
  if (!req.auth?.token.admin) throw new HttpsError('permission-denied', 'Admins only')
  const { type } = req.data as { type: 'weekly' | 'monthly' }
  if (!['weekly', 'monthly'].includes(type)) {
    throw new HttpsError('invalid-argument', 'type must be weekly or monthly')
  }
  const db = admin.firestore()
  const recipients = await getDigestRecipients(type)
  const content = await gatherDigestContent(db)
  await sendDigestBatch(recipients, type, content, db)
  return { ok: true, recipients: recipients.length }
})
