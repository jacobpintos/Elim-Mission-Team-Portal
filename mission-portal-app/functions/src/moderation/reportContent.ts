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
  messageText: string
  messageTs: number
  authorUid: string
  reason: string
  details: string
}

/**
 * Records a user's report about a message and hides that message from the
 * reporter immediately.
 *
 * Guideline 1.2 requires a report mechanism available to every user, not just
 * moderators. Reports land in `contentReports` for admins to work through in
 * Admin → Moderation.
 */
export const reportContent = onCall(async (req) => {
  const reporterUid = req.auth?.uid
  if (!reporterUid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const input = req.data as ReportInput
  if (!input?.roomId || !input?.messageId) {
    throw new HttpsError('invalid-argument', 'roomId and messageId are required')
  }
  if (!VALID_REASONS.includes(input.reason)) {
    throw new HttpsError('invalid-argument', 'Unknown report reason')
  }

  const db = admin.firestore()

  // The reporter has to be able to see the room they are reporting from: either
  // a member, or an admin (who can read every room and so can moderate one they
  // are not part of).
  const room = await db.doc(`rooms/${input.roomId}`).get()
  if (!room.exists) throw new HttpsError('not-found', 'No such room')
  const members: string[] = room.data()?.members ?? []
  if (!members.includes(reporterUid)) {
    const roles: string[] = (await db.doc(`users/${reporterUid}`).get()).data()?.roles ?? []
    if (!roles.includes('admin')) {
      throw new HttpsError('permission-denied', 'Not a member of that room')
    }
  }

  await db.collection('contentReports').add({
    roomId: input.roomId,
    messageId: input.messageId,
    messageText: String(input.messageText ?? '').slice(0, 2000),
    messageTs: input.messageTs ?? null,
    authorUid: input.authorUid ?? null,
    reporterUid,
    reason: input.reason,
    details: String(input.details ?? '').slice(0, 2000),
    status: 'open',
    createdAt: Date.now(),
  })

  // Hide it from the reporter right away — Apple expects reported content to
  // disappear for the person who reported it without waiting for a moderator.
  await db.doc(`users/${reporterUid}`).update({
    reportedMessages: admin.firestore.FieldValue.arrayUnion(input.messageId),
  })

  logger.info(`contentReport filed by ${reporterUid} on ${input.roomId}/${input.messageId}`)
  return { ok: true }
})
