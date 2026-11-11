import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { requireAdmin } from '../owner'
import { notifyUser } from '../push/notifyCore'

if (!admin.apps.length) admin.initializeApp()

/**
 * Whoever wrote a reported message, warned by an admin (Moderation).
 *
 * The app names the report and nothing else: who is warned is whoever the
 * report says wrote the message — which reportContent read from the message
 * itself — and what they are told is written here.
 */
export const warnReportedAuthor = onCall(async (req) => {
  const caller = await requireAdmin(req.auth?.uid)
  const reportId = typeof req.data?.reportId === 'string' ? req.data.reportId : ''
  if (!reportId || reportId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Which report?')
  }
  const report = (await admin.firestore().doc(`contentReports/${reportId}`).get()).data()
  if (!report) throw new HttpsError('not-found', 'That report is no longer there.')
  const author = typeof report.authorUid === 'string' ? report.authorUid : ''
  if (!author) throw new HttpsError('failed-precondition', 'That report names nobody to warn.')
  await notifyUser(author, 'announcement', {
    title: 'Warning from the Mission Portal team',
    link: '/(app)/messages',
  })
  logger.info('warnReportedAuthor', { reportId, by: caller })
  return { ok: true }
})
