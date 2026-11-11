import { HttpsError, onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { requireAdmin } from '../owner'
import { todayInOrg } from '../org'
import { outstandingFor, type OutstandingRequest } from './logic'

if (!admin.apps.length) admin.initializeApp()

/**
 * The reimbursement requests still open on one event, for an admin's report
 * on it (src/lib/eventReport): how many wait for a decision, how many wait to
 * be paid, and how many of those are past their pay-by date.
 *
 * Counts only, to an admin. A request — who asked, for what, and how much —
 * is theirs and the Accountant's business (firestore.rules reimbursements),
 * and an event's report doesn't change that. The amounts go to the
 * Accountant alone, who sees them in Finance anyway.
 *
 * `date`: one date's alone, for a repeating event.
 */
export const eventReimbursements = onCall(async (req) => {
  const uid = await requireAdmin(req.auth?.uid)
  const eventId = typeof req.data?.eventId === 'string' ? req.data.eventId.slice(0, 128) : ''
  if (!eventId || eventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?')
  const date =
    typeof req.data?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.data.date)
      ? req.data.date
      : null

  const db = admin.firestore()
  const [snap, config] = await Promise.all([
    db.collection('reimbursements').where('eventId', '==', eventId).get(),
    db.doc('config/main').get(),
  ])
  const summary = outstandingFor(
    snap.docs.map((d) => d.data() as OutstandingRequest),
    { date, today: todayInOrg() }
  )
  const amounts = config.data()?.connectConfig?.accountant === uid
  return amounts
    ? { ...summary, amounts }
    : { ...summary, toDecideCents: 0, toPayCents: 0, amounts }
})
