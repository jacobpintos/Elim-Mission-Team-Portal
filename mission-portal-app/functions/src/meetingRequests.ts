import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { sendExpoPush } from './push/expoPush'
import { extractTokens } from './push/notifyCore'

if (!admin.apps.length) admin.initializeApp()

const COLLECTION = 'meetingRequests'

/**
 * The next task id, from the same counter the app's own createTask uses.
 *
 * Task ids are sequential here rather than Firestore auto-ids, and a task
 * arriving with an auto-id would sort and read differently from every other
 * one. Worth a transaction to stay consistent.
 */
async function nextTaskId(db: FirebaseFirestore.Firestore): Promise<number> {
  const ref = db.doc('config/main')
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = Number(snap.data()?.nTask ?? 1)
    tx.update(ref, { nTask: current + 1 })
    return current
  })
}

/** One request per person per day, counted on the server. */
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000

const MAX_AVAILABILITY = 1000
const MAX_MESSAGE = 2000
const MAX_LEADERS = 10

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Take a meeting request, and tell the people it was addressed to.
 *
 * Everything is checked here rather than trusted from the form. The client
 * enforces the same daily limit, but a client-side limit is a courtesy to the
 * person typing, not a control — this one reads the last request off the
 * server and is the one that counts.
 *
 * The people notified are the leaders named on the request, and only them. An
 * admin can read every request for support, but nobody is woken about a
 * conversation they were not asked to have.
 *
 * Deliberately does NOT write to notifs/{uid}. That list is where reminders and
 * announcements collect, and a person waiting on an answer should not be
 * queued behind them. It gets a push of its own instead.
 *
 * What it does create is one task, assigned to everyone named on the request.
 * A request to meet is work someone has to do, and the app already has a place
 * for work someone has to do — with a status, a due date and a screen people
 * already check. One task rather than one each, so that whoever picks it up
 * marks it done and the others can see it is handled: three separate tasks
 * would have the visitor contacted three times, or nobody sure whose it was.
 */
export const sendMeetingRequest = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to request a meeting.')

  const db = admin.firestore()

  const leaders = Array.isArray(request.data?.leaders)
    ? [...new Set(request.data.leaders.map((l: unknown) => String(l)).filter(Boolean))]
    : []
  if (leaders.length === 0) {
    throw new HttpsError('invalid-argument', 'Choose at least one person to meet with.')
  }
  if (leaders.length > MAX_LEADERS) {
    throw new HttpsError('invalid-argument', 'Too many people selected.')
  }

  const availability = clean(request.data?.availability, MAX_AVAILABILITY)
  if (!availability) {
    throw new HttpsError('invalid-argument', 'Say when you are available.')
  }

  const senderSnap = await db.doc(`users/${uid}`).get()
  const sender = senderSnap.data()
  if (!sender) throw new HttpsError('failed-precondition', 'Your account could not be read.')

  const last = Number(sender.lastMeetingRequest ?? 0)
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    throw new HttpsError('resource-exhausted', 'You have already sent a request today.')
  }

  // The name and address come off the account, not the form. A request is
  // answered by replying to the person, and a typed address could be anyone's.
  const fromName = clean(sender.displayName, 200) || 'Someone'
  const fromEmail = clean(sender.email, 320)

  const now = Date.now()
  const ref = db.collection(COLLECTION).doc()
  await ref.set({
    id: ref.id,
    fromUid: uid,
    fromName,
    fromEmail,
    leaders,
    availability,
    message: clean(request.data?.message, MAX_MESSAGE),
    createdAt: now,
    status: 'open',
  })

  // Stamped by the server for the same reason the limit is checked here.
  await db.doc(`users/${uid}`).set({ lastMeetingRequest: now }, { merge: true })

  const taskId = await nextTaskId(db)
  await db.doc(`tasks/${taskId}`).set({
    id: taskId,
    title: `Contact ${fromName} about a meeting`,
    assignees: leaders,
    lead: null,
    by: uid,
    status: 'pending',
    taskType: 'meeting_request',
    meetingRequestId: ref.id,
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  await ref.set({ taskId }, { merge: true })

  // Gathered here, on the way past, because a leader answering this cannot
  // look them up for themselves: `users` is readable only by its owner and by
  // admins, and most of the leadership team holds neither claim over the
  // others. Stored on the request so the reply can copy in the rest of the
  // people it was addressed to.
  const tokens: string[] = []
  const leaderEmails: string[] = []
  for (const leaderUid of leaders) {
    const snap = await db.doc(`users/${leaderUid}`).get()
    const profile = snap.data()
    if (!profile) continue
    tokens.push(...extractTokens(profile.pushTokens))
    const email = clean(profile.email, 320)
    if (email) leaderEmails.push(email)
  }
  if (leaderEmails.length > 0) await ref.set({ leaderEmails }, { merge: true })

  if (tokens.length > 0) {
    await sendExpoPush(
      tokens,
      'Meeting request',
      `${fromName} asked to meet with you.`,
      {
        type: 'meetingRequest',
        id: ref.id,
        taskId: String(taskId),
        // The task, not a screen of its own. The request is shown inside its
        // task, and `taskId` is what the assignments screen uses to lift that
        // one to the top — otherwise a tap lands on a list and leaves somebody
        // hunting for the thing they were just told about.
        link: `/(app)/assignments?taskId=${taskId}`,
      },
      // Not batched and not held. A request to meet is a person waiting on an
      // answer, and the whole point of keeping it out of the notifications
      // list is that it should not queue behind anything.
      { interruptionLevel: 'active' }
    )
  }

  logger.info('[sendMeetingRequest] stored', {
    id: ref.id,
    taskId,
    leaders: leaders.length,
    tokens: tokens.length,
  })

  return { id: ref.id, taskId }
})
