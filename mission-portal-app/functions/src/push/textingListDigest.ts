import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

export const SIGNUPS = 'textingListSignups'

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

export interface Signup {
  uid: string
  displayName: string
  phone: string
}

/**
 * E.164 back to how a person writes it.
 *
 * Mirrors formatPhone in src/lib/textingList.ts. The two packages cannot
 * import from one another, so this is a deliberate copy and the tests on both
 * sides use the same numbers.
 */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  if (!m) return e164
  return `(${m[1]}) ${m[2]}-${m[3]}`
}

/**
 * The message the Connections Coordinator receives.
 *
 * Names and numbers in full rather than a count: the point of the message is
 * that it can be acted on without opening anything.
 */
export function signupDigestMessage(signups: Signup[]): string {
  const who = signups.length === 1 ? '1 person wants' : `${signups.length} people want`
  const lines = signups
    .map((s) => `${s.displayName.trim() || 'Someone'} — ${formatPhone(s.phone)}`)
    .join('\n')
  return `${who} to join the texting list:\n${lines}`
}

/** Who holds the Connections Coordinator identifier, or null if nobody does. */
export async function coordinatorUid(db: admin.firestore.Firestore): Promise<string | null> {
  const snap = await db.doc('config/main').get()
  const uid = snap.data()?.connectConfig?.connectionsCoordinator
  return typeof uid === 'string' && uid.trim() !== '' ? uid : null
}

/**
 * Hand the day's texting-list requests to the Connections Coordinator.
 *
 * Nothing here sends a text. Someone who asked to be added has given a name
 * and a number, and this puts both in front of the one person whose job it is
 * to add them to whatever service actually sends them — which is why the
 * request is stored pending and only cleared once it has been delivered.
 *
 * Five in the afternoon, Central, once a day. A sign-up is not urgent, and a
 * push per person would make a busy Sunday unusable.
 *
 * If nobody holds the identifier the requests stay pending rather than being
 * dropped, so designating a coordinator later still delivers the backlog.
 */
export const textingListDigest = onSchedule(
  { schedule: '0 17 * * *', timeZone: 'America/Chicago' },
  async () => {
    const db = admin.firestore()

    const snap = await db.collection(SIGNUPS).where('status', '==', 'pending').get()
    if (snap.empty) return

    const uid = await coordinatorUid(db)
    if (!uid) {
      logger.warn('[textingList] nobody holds Connections Coordinator; holding requests', {
        pending: snap.size,
      })
      return
    }

    const signups: Signup[] = snap.docs.map((d) => {
      const data = d.data()
      return {
        uid: String(data.uid ?? d.id),
        displayName: String(data.displayName ?? ''),
        phone: String(data.phone ?? ''),
      }
    })

    await notifyUser(uid, 'textingListSignup', {
      message: signupDigestMessage(signups),
      count: signups.length,
    })

    // Cleared only after the message is away. A send that throws leaves them
    // pending, and tomorrow's run carries them again — a repeated name is a
    // far smaller problem than a request nobody ever sees.
    const sentAt = admin.firestore.FieldValue.serverTimestamp()
    let batch = db.batch()
    let pending = 0
    for (const doc of snap.docs) {
      batch.update(doc.ref, { status: 'sent', sentAt })
      pending += 1
      if (pending >= BATCH_LIMIT) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
    if (pending > 0) await batch.commit()

    logger.info('[textingList] delivered to coordinator', { uid, count: signups.length })
  }
)
