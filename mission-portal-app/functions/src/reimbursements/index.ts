import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from '../push/notifyCore'
import {
  MAX_RECEIPTS,
  MAX_REASON,
  canDecide,
  cleanDecision,
  cleanItems,
  decisionMessage,
  formatCents,
  isAwaitingPayment,
  isIsoDate,
  paidMessage,
  payDateAnswerMessage,
  payDateRequestMessage,
  submittedMessage,
  taskStatusFor,
  totalOf,
  type Decision,
  type PayDateChange,
  type ReimbursementItem,
  type ReimbursementStatus,
} from './logic'

if (!admin.apps.length) admin.initializeApp()

/**
 * Reimbursement requests: someone who paid for something for an event asks
 * the church to pay them back, and the Accountant answers.
 *
 * Every step goes through a callable here rather than a client write, for the
 * same reason meeting requests do: each one has to change the request, move
 * the task that tracks it and tell the other person, and a client trusted to
 * do all three could do any one of them on its own — approve its own request,
 * say. The Firestore rules let nobody write `reimbursements` directly.
 *
 * The request is tracked by a task assigned to the Accountant, so it sits with
 * the rest of their work, has a due date (the pay-by date) and gets the usual
 * reminders. Its `owner` is the person who asked, which puts it on their task
 * list too so they can follow it. Amounts and receipts are kept off the task:
 * tasks are readable by every member, and what someone spent is not.
 */

const COLLECTION = 'reimbursements'

/**
 * Who the Accountant is until an admin chooses someone in Admin → Leadership.
 *
 * The church asked for Sunny Singh to hold it. Matched by name the first time
 * a request needs routing, then written to config like any other choice — so
 * from then on it is an ordinary setting, and changing it in the app wins.
 */
const FIRST_ACCOUNTANT_NAME = 'Sunny Singh'

const MAX_NOTE = 1000

const CALL_OPTS = { secrets: [RESEND_API_KEY] }

/** Today in Iowa, which is when "already passed" is decided. */
function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  return uid
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function nameOf(db: FirebaseFirestore.Firestore, uid: string): Promise<string> {
  const snap = await db.doc(`users/${uid}`).get()
  const data = snap.data()
  return clean(data?.displayName, 200) || clean(data?.email, 320) || 'Someone'
}

/**
 * The Accountant's uid, choosing the first one if nobody has been chosen.
 *
 * Null when there is nobody to send a request to — no one chosen, and no
 * single account by the first accountant's name to fall back on.
 */
export async function resolveAccountant(db: FirebaseFirestore.Firestore): Promise<string | null> {
  const configRef = db.doc('config/main')
  const current = clean((await configRef.get()).data()?.connectConfig?.accountant, 128)
  if (current) return current

  const wanted = FIRST_ACCOUNTANT_NAME.toLowerCase()
  const users = await db.collection('users').get()
  const matches = users.docs.filter(
    (d) => clean(d.data().displayName, 200).toLowerCase() === wanted
  )
  // Two people by the same name is not a choice to make for the church.
  if (matches.length !== 1) return null

  const uid = matches[0].id
  await configRef.set({ connectConfig: { accountant: uid } }, { merge: true })
  logger.info('[reimbursements] first accountant set', { uid })
  return uid
}

/** The next task id, from the counter the app's own createTask uses. */
async function nextTaskId(db: FirebaseFirestore.Firestore): Promise<number> {
  const ref = db.doc('config/main')
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = Number(snap.data()?.nTask ?? 1)
    tx.update(ref, { nTask: current + 1 })
    return current
  })
}

interface StoredRequest {
  id: string
  submitterUid: string
  submitterName: string
  accountantUid: string
  accountantName: string
  eventId: string
  eventTitle: string
  eventDate: string | null
  items: ReimbursementItem[]
  total: number
  receipts: string[]
  note: string
  status: ReimbursementStatus
  approvedAmount: number | null
  reason: string
  payBy: string | null
  dateChange: PayDateChange | null
  taskId: number
}

function historyEntry(by: string, text: string) {
  return { at: Date.now(), by, text }
}

function taskLink(taskId: number): string {
  // The task, lifted to the top of the assignments screen. The request is
  // shown inside it, so this is where the person can act on what they were told.
  return `/(app)/assignments?taskId=${taskId}`
}

async function tell(uid: string, message: string, r: Pick<StoredRequest, 'id' | 'taskId'>) {
  try {
    await notifyUser(uid, 'reimbursement', {
      message,
      reimbursementId: r.id,
      taskId: String(r.taskId),
      link: taskLink(r.taskId),
    })
  } catch (err) {
    // The step itself has happened; a failed push should not undo it or tell
    // the person who took it that it failed.
    logger.error('[reimbursements] notify failed', { uid, err })
  }
}

/**
 * Load a request for a step only one side may take, and refuse anyone else.
 */
async function loadFor(
  db: FirebaseFirestore.Firestore,
  id: unknown,
  uid: string,
  side: 'accountant' | 'submitter'
): Promise<{ ref: FirebaseFirestore.DocumentReference; r: StoredRequest }> {
  const reqId = clean(id, 128)
  if (!reqId) throw new HttpsError('invalid-argument', 'Which request?')
  const ref = db.doc(`${COLLECTION}/${reqId}`)
  const snap = await ref.get()
  const r = snap.data() as StoredRequest | undefined
  if (!r) throw new HttpsError('not-found', 'That request no longer exists.')
  const allowed = side === 'accountant' ? r.accountantUid === uid : r.submitterUid === uid
  if (!allowed) {
    throw new HttpsError(
      'permission-denied',
      side === 'accountant'
        ? 'Only the Accountant can do that.'
        : 'Only the person who asked can do that.'
    )
  }
  return { ref, r: { ...r, id: snap.id } }
}

// ─── Asking ──────────────────────────────────────────────────────────────────

export const submitReimbursement = onCall(CALL_OPTS, async (req) => {
  const uid = requireUid(req)
  const db = admin.firestore()

  const profile = (await db.doc(`users/${uid}`).get()).data()
  const roles: string[] = Array.isArray(profile?.roles) ? profile.roles : []
  if (!profile || roles.every((r) => r === 'public' || r === 'unverified')) {
    throw new HttpsError('permission-denied', 'Reimbursements are for team members.')
  }

  const items = cleanItems(req.data?.items)
  if (typeof items === 'string') throw new HttpsError('invalid-argument', items)

  // Receipts are uploaded before the request is sent, into the person's own
  // folder — which the Storage rules let only them write. A path anywhere else
  // would be someone else's receipt.
  const prefix = `reimbursements/${uid}/`
  const receipts: string[] = Array.isArray(req.data?.receipts)
    ? [...new Set(req.data.receipts.map((p: unknown) => clean(p, 400)))].filter(
        (p): p is string => typeof p === 'string' && p.startsWith(prefix) && !p.includes('..')
      )
    : []
  if (receipts.length === 0) throw new HttpsError('invalid-argument', 'Add a photo of the receipt.')
  if (receipts.length > MAX_RECEIPTS) {
    throw new HttpsError('invalid-argument', `No more than ${MAX_RECEIPTS} receipt photos.`)
  }

  // The event's name from the event, not the form.
  const eventId = clean(req.data?.eventId, 128)
  if (!eventId) throw new HttpsError('invalid-argument', 'Choose the event this was for.')
  const event = (await db.doc(`events/${eventId}`).get()).data()
  if (!event || event.deleted) throw new HttpsError('not-found', 'That event no longer exists.')
  const eventTitle = clean(event.title, 200) || 'an event'
  const eventDate = isIsoDate(req.data?.eventDate) ? req.data.eventDate : (event.date ?? null)

  const accountantUid = await resolveAccountant(db)
  if (!accountantUid) {
    throw new HttpsError(
      'failed-precondition',
      'Nobody is set as the Accountant yet. Ask an admin to choose one in Admin → Leadership.'
    )
  }

  const submitterName = clean(profile.displayName, 200) || clean(profile.email, 320) || 'Someone'
  const accountantName = await nameOf(db, accountantUid)
  const total = totalOf(items)
  const taskId = await nextTaskId(db)
  const ref = db.collection(COLLECTION).doc()

  const request: StoredRequest = {
    id: ref.id,
    submitterUid: uid,
    submitterName,
    accountantUid,
    accountantName,
    eventId,
    eventTitle,
    eventDate,
    items,
    total,
    receipts,
    note: clean(req.data?.note, MAX_NOTE),
    status: 'submitted',
    approvedAmount: null,
    reason: '',
    payBy: null,
    dateChange: null,
    taskId,
  }

  await ref.set({
    ...request,
    createdAt: Date.now(),
    history: [historyEntry(uid, `Asked for ${formatCents(total)}`)],
  })

  await db.doc(`tasks/${taskId}`).set({
    id: taskId,
    title: `Reimbursement: ${submitterName} · ${eventTitle}`,
    assignees: [accountantUid],
    owner: uid,
    lead: accountantUid,
    by: uid,
    status: 'pending',
    taskType: 'reimbursement',
    reimbursementId: ref.id,
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  await tell(accountantUid, submittedMessage({ ...request, total }), request)
  logger.info('[submitReimbursement] stored', { id: ref.id, taskId, items: items.length })
  return { id: ref.id, taskId }
})

// ─── Deciding ────────────────────────────────────────────────────────────────

export const decideReimbursement = onCall(CALL_OPTS, async (req) => {
  const uid = requireUid(req)
  const db = admin.firestore()
  const { ref, r } = await loadFor(db, req.data?.id, uid, 'accountant')

  if (!canDecide(r.status)) {
    throw new HttpsError('failed-precondition', 'This request has already been answered.')
  }
  const decision = cleanDecision(
    {
      decision: req.data?.decision as Decision,
      approvedAmount: req.data?.approvedAmount,
      reason: req.data?.reason,
      payBy: req.data?.payBy,
    },
    r.total,
    today()
  )
  if (typeof decision === 'string') throw new HttpsError('invalid-argument', decision)

  const summary =
    decision.status === 'denied'
      ? `Denied: ${decision.reason}`
      : decision.status === 'approved'
        ? `Approved ${formatCents(decision.approvedAmount)}, to be paid by ${decision.payBy}`
        : `Approved ${formatCents(decision.approvedAmount)} of ${formatCents(r.total)}, to be paid by ${decision.payBy}: ${decision.reason}`

  // Checked again inside the write, so two taps — or two devices — cannot
  // answer the same request twice.
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as StoredRequest | undefined
    if (!fresh || !canDecide(fresh.status)) {
      throw new HttpsError('failed-precondition', 'This request has already been answered.')
    }
    tx.update(ref, {
      status: decision.status,
      approvedAmount: decision.approvedAmount,
      reason: decision.reason,
      payBy: decision.payBy,
      decidedAt: Date.now(),
      history: admin.firestore.FieldValue.arrayUnion(historyEntry(uid, summary)),
    })
    tx.update(db.doc(`tasks/${r.taskId}`), {
      status: taskStatusFor(decision.status),
      dueDate: decision.payBy,
      ...(decision.status === 'denied'
        ? { doneAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
      _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })

  await tell(r.submitterUid, decisionMessage(r, decision), r)
  return { status: decision.status }
})

// ─── Moving the pay date ─────────────────────────────────────────────────────

export const requestPayDateChange = onCall(CALL_OPTS, async (req) => {
  const uid = requireUid(req)
  const db = admin.firestore()
  const { ref, r } = await loadFor(db, req.data?.id, uid, 'accountant')

  if (!isAwaitingPayment(r.status) || !r.payBy) {
    throw new HttpsError('failed-precondition', 'There is no payment waiting on this request.')
  }
  if (r.dateChange) {
    throw new HttpsError('failed-precondition', 'A new date has already been asked for.')
  }
  const proposed = req.data?.proposed
  if (!isIsoDate(proposed)) throw new HttpsError('invalid-argument', 'Choose the new date.')
  if (proposed < today()) throw new HttpsError('invalid-argument', 'That date has already passed.')
  if (proposed === r.payBy) {
    throw new HttpsError('invalid-argument', 'That is already the pay-by date.')
  }
  const reason = clean(req.data?.reason, MAX_REASON)
  if (!reason) throw new HttpsError('invalid-argument', 'Say why the date needs to move.')

  const change: PayDateChange = { proposed, reason, requestedAt: Date.now() }
  await ref.update({
    dateChange: change,
    history: admin.firestore.FieldValue.arrayUnion(
      historyEntry(uid, `Asked to move the pay-by date from ${r.payBy} to ${proposed}: ${reason}`)
    ),
  })

  await tell(r.submitterUid, payDateRequestMessage({ ...r, payBy: r.payBy }, change), r)
  return { ok: true }
})

export const answerPayDateChange = onCall(CALL_OPTS, async (req) => {
  const uid = requireUid(req)
  const db = admin.firestore()
  const { ref, r } = await loadFor(db, req.data?.id, uid, 'submitter')

  const change = r.dateChange
  if (!change || !isAwaitingPayment(r.status)) {
    throw new HttpsError('failed-precondition', 'There is no date change waiting for an answer.')
  }
  const accepted = req.data?.accept === true

  await db.runTransaction(async (tx) => {
    tx.update(ref, {
      dateChange: null,
      ...(accepted ? { payBy: change.proposed } : {}),
      history: admin.firestore.FieldValue.arrayUnion(
        historyEntry(
          uid,
          accepted
            ? `Accepted the new pay-by date, ${change.proposed}`
            : `Kept the pay-by date, ${r.payBy}`
        )
      ),
    })
    if (accepted) {
      tx.update(db.doc(`tasks/${r.taskId}`), {
        dueDate: change.proposed,
        // A new due date is a new reason to remind; the old one's reminders
        // were for a date that no longer applies.
        notifiedDueWeekAt: null,
        notifiedDueTodayAt: null,
        overdueNotified: false,
        _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  })

  await tell(r.accountantUid, payDateAnswerMessage(r, change, accepted), r)
  return { accepted }
})

// ─── Paying ──────────────────────────────────────────────────────────────────

/**
 * The room the Accountant and the person they paid share, made if need be.
 *
 * Keyed by the pair, so every reimbursement between the same two people lands
 * in the same conversation instead of a new room each time.
 */
async function roomFor(
  db: FirebaseFirestore.Firestore,
  a: { uid: string; name: string },
  b: { uid: string; name: string }
): Promise<string> {
  const [x, y] = [a.uid, b.uid].sort()
  const id = `dm_${x}_${y}`
  const ref = db.doc(`rooms/${id}`)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      name: `${a.name} & ${b.name}`,
      members: [a.uid, b.uid],
      call: false,
      reviewers: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  return id
}

export const markReimbursementPaid = onCall(CALL_OPTS, async (req) => {
  const uid = requireUid(req)
  const db = admin.firestore()
  const { ref, r } = await loadFor(db, req.data?.id, uid, 'accountant')

  if (!isAwaitingPayment(r.status)) {
    throw new HttpsError('failed-precondition', 'There is no payment waiting on this request.')
  }
  const approvedAmount = Number(r.approvedAmount ?? r.total)
  const note = clean(req.data?.note, MAX_NOTE)

  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as StoredRequest | undefined
    if (!fresh || !isAwaitingPayment(fresh.status)) {
      throw new HttpsError('failed-precondition', 'This request has already been paid.')
    }
    tx.update(ref, {
      status: 'paid',
      paidAt: Date.now(),
      // Paid is paid: a date change still waiting has nothing left to move.
      dateChange: null,
      history: admin.firestore.FieldValue.arrayUnion(
        historyEntry(uid, `Paid ${formatCents(approvedAmount)}${note ? `: ${note}` : ''}`)
      ),
    })
    tx.update(db.doc(`tasks/${r.taskId}`), {
      status: 'done',
      doneAt: admin.firestore.FieldValue.serverTimestamp(),
      _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })

  const message = paidMessage({ ...r, approvedAmount })
  await tell(r.submitterUid, message, r)

  // And a message, so there is a record of it in their conversations and a
  // place to reply if the money has not arrived.
  try {
    const roomId = await roomFor(
      db,
      { uid: r.accountantUid, name: r.accountantName },
      { uid: r.submitterUid, name: r.submitterName }
    )
    const ts = Date.now()
    await db.doc(`rooms/${roomId}/messages/${ts}_${uid}`).set({
      uid,
      text: note ? `${message} ${note}` : message,
      attachment: null,
      ts,
      readBy: { [uid]: true },
    })
    await db.doc(`rooms/${roomId}`).update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (err) {
    logger.error('[markReimbursementPaid] message failed', { id: r.id, err })
  }

  return { ok: true }
})
