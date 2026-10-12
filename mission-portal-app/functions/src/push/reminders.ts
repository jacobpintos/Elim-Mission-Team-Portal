import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/** Missed by more than this (the job down a while): dropped, not sent late. */
const TOO_LATE_MS = 12 * 60 * 60 * 1000

/**
 * Reminders people set for themselves (Miriam: "remind me to go to Costco at
 * 5 pm tomorrow"), sent at their time as a push — they show in the Tasks tab
 * too (src/stores/remindersStore).
 *
 * Every minute, the ones still to send (`pending`, a field each has, so no
 * index is needed) whose time has come. Each is claimed before it is sent, so
 * a run that overlaps another never sends it twice; one marked done before
 * its time is not sent at all.
 */
export const sendDueReminders = onSchedule(
  { schedule: 'every 1 minutes', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore()
    const now = Date.now()
    const snap = await db.collection('reminders').where('pending', '==', true).get()
    for (const doc of snap.docs) {
      const r = doc.data() as { uid?: string; text?: string; remindAt?: number; done?: boolean }
      if (typeof r.remindAt !== 'number' || r.remindAt > now) continue
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref)
        if (!fresh.exists || fresh.data()?.pending !== true) return false
        tx.update(doc.ref, { pending: false, sentAt: now })
        return true
      })
      if (!claimed || r.done || !r.uid) continue
      if (now - r.remindAt > TOO_LATE_MS) {
        logger.warn('sendDueReminders: too late to send', { id: doc.id })
        continue
      }
      try {
        await notifyUser(
          r.uid,
          'reminder',
          { text: r.text ?? '', link: '/assignments' },
          { immediate: true }
        )
      } catch (err) {
        logger.error('sendDueReminders: failed', { id: doc.id, err })
      }
    }
  }
)
