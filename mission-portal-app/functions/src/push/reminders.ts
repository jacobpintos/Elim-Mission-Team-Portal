import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'
import { clockOf, nextOccurrence, zonedTime, type Repeat } from './reminderTime'
import { instancesOf, type EventTemplate } from '../miriam/data'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

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
      const r = doc.data() as {
        uid?: string
        text?: string
        remindAt?: number
        done?: boolean
        repeat?: Repeat
        tz?: string
      }
      if (typeof r.remindAt !== 'number' || r.remindAt > now) continue
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref)
        if (!fresh.exists || fresh.data()?.pending !== true) return false
        // A repeating one is set for its next time as it is sent; any other is done with.
        tx.update(
          doc.ref,
          r.repeat
            ? {
                remindAt: nextOccurrence(r.remindAt as number, r.repeat, r.tz, now),
                done: false,
                sentAt: now,
              }
            : { pending: false, sentAt: now }
        )
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
          { text: r.text ?? '', link: '/assignments', reminderId: doc.id },
          { immediate: true }
        )
      } catch (err) {
        logger.error('sendDueReminders: failed', { id: doc.id, err })
      }
    }
  }
)

/**
 * Reminders tied to an event ("remind me an hour before Revival") move with
 * it: when an event's date or time changes, each still to send is set again
 * from the new start, in the time zone of whoever set it.
 */
export const moveEventReminders = onDocumentWritten('events/{eventId}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return
  const db = admin.firestore()
  const snap = await db
    .collection('reminders')
    .where('eventTemplateId', '==', event.params.eventId)
    .get()
  if (snap.empty) return
  const { overrides, ...tmpl } = after.data() as EventTemplate & {
    overrides?: Record<string, Partial<EventTemplate>>
  }
  const now = Date.now()
  for (const doc of snap.docs) {
    const r = doc.data() as {
      pending?: boolean
      done?: boolean
      eventKey?: string
      minutesBefore?: number
      tz?: string
      remindAt?: number
    }
    if (!r.pending || r.done || !r.eventKey || typeof r.minutesBefore !== 'number') continue
    const date = r.eventKey.slice(r.eventKey.lastIndexOf('_') + 1)
    const ev = instancesOf({ ...tmpl, id: event.params.eventId }, date, date, overrides ?? {}).find(
      (i) => i.instanceKey === r.eventKey
    )
    const clock = clockOf(ev?.startTime)
    if (!ev || !clock) continue
    const [y, m, d] = ev.date.split('-').map(Number)
    let start: number
    try {
      start = zonedTime(y, m, d, clock.h, clock.min, r.tz || 'UTC')
    } catch {
      continue
    }
    const remindAt = start - r.minutesBefore * 60_000
    if (remindAt !== r.remindAt && remindAt > now) {
      await doc.ref.update({ remindAt })
      logger.info('moveEventReminders: moved', { id: doc.id })
    }
  }
})
