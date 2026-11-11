import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

const VALID_REASONS = [
  'Harassment or bullying',
  'Hate speech',
  'Sexual or explicit content',
  'Violence or threats',
  'Spam or scam',
  'Other',
]

interface ReportInput {
  roomId: string
  messageId: string
  reason: string
  details: string
}

/** A message as it is kept (the app's Message type): rooms/{roomId}/messages/{id}. */
interface StoredMessage {
  uid?: unknown
  text?: unknown
  ts?: unknown
  attachment?: { type?: unknown; url?: unknown; name?: unknown } | null
}

/**
 * Records a user's report about a message and hides that message from the
 * reporter immediately.
 *
 * Guideline 1.2 requires a report mechanism available to every user, not just
 * moderators. Reports land in `contentReports` for admins to work through in
 * Admin → Moderation.
 *
 * What was said, by whom and when is read here from the message itself. It
 * used to be taken from the reporter's app, so a report could put any words
 * in anyone's mouth — and an admin might warn them, or remove their account,
 * over a message they never sent. The app still sends its copy; it is not read.
 */
export const reportContent = onCall(async (req) => {
  const reporterUid = req.auth?.uid
  if (!reporterUid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const input = (req.data ?? {}) as Partial<ReportInput>
  const roomId = typeof input.roomId === 'string' ? input.roomId : ''
  const messageId = typeof input.messageId === 'string' ? input.messageId : ''
  if (!roomId || !messageId || roomId.includes('/') || messageId.includes('/')) {
    throw new HttpsError('invalid-argument', 'roomId and messageId are required')
  }
  if (typeof input.reason !== 'string' || !VALID_REASONS.includes(input.reason)) {
    throw new HttpsError('invalid-argument', 'Unknown report reason')
  }

  const db = admin.firestore()

  // The reporter has to be able to see the room they are reporting from: either
  // a member, or an admin (who can read every room and so can moderate one they
  // are not part of).
  const room = await db.doc(`rooms/${roomId}`).get()
  if (!room.exists) throw new HttpsError('not-found', 'No such room')
  const members: string[] = room.data()?.members ?? []
  if (!members.includes(reporterUid)) {
    const roles: string[] = (await db.doc(`users/${reporterUid}`).get()).data()?.roles ?? []
    if (!roles.includes('admin')) {
      throw new HttpsError('permission-denied', 'Not a member of that room')
    }
  }

  const found = await db.doc(`rooms/${roomId}/messages/${messageId}`).get()
  if (!found.exists) throw new HttpsError('not-found', 'That message is no longer there.')
  const message = found.data() as StoredMessage
  const attached = message.attachment

  await db.collection('contentReports').add({
    roomId,
    messageId,
    messageText: String(message.text ?? '').slice(0, 2000),
    // Copied onto the report so a moderator can see the image that was actually
    // reported. Without it an image report reads as an empty message and there
    // is nothing to judge.
    attachment: attached
      ? {
          type: attached.type === 'file' ? 'file' : 'image',
          url: String(attached.url ?? ''),
          name: attached.name ? String(attached.name) : null,
        }
      : null,
    messageTs: typeof message.ts === 'number' ? message.ts : null,
    authorUid: message.uid != null ? String(message.uid) : null,
    reporterUid,
    reason: input.reason,
    details: String(input.details ?? '').slice(0, 2000),
    status: 'open',
    createdAt: Date.now(),
  })

  // Hide it from the reporter right away — Apple expects reported content to
  // disappear for the person who reported it without waiting for a moderator.
  await db.doc(`users/${reporterUid}`).update({
    reportedMessages: admin.firestore.FieldValue.arrayUnion(messageId),
  })

  logger.info(`contentReport filed by ${reporterUid} on ${roomId}/${messageId}`)
  return { ok: true }
})
