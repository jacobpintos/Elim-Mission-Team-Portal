import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import {
  KEEP_EVENT_MONTHS,
  KEEP_INVITE_DAYS,
  daysBefore,
  iowaToday,
  lastDayOf,
  monthsBefore,
  pastKeeping,
} from './eventRetention'

if (!admin.apps.length) admin.initializeApp()

/** Firestore takes at most 500 writes a batch. */
const BATCH = 450

async function deleteAll(db: admin.firestore.Firestore, refs: admin.firestore.DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch()
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r))
    await batch.commit()
  }
}

/**
 * The documents of `collection` keyed `<eventId>_<date>…` with a date before
 * `before` — a range over the document id, as ./onEventDeleted finds an
 * event's. `<eventId>_series` sorts after every date, so a series' standing
 * answer is never among them.
 */
async function datedBefore(
  db: admin.firestore.Firestore,
  collection: string,
  eventId: string,
  before: string
) {
  const snap = await db
    .collection(collection)
    .where(admin.firestore.FieldPath.documentId(), '>=', `${eventId}_`)
    .where(admin.firestore.FieldPath.documentId(), '<', `${eventId}_${before}`)
    .get()
  return snap.docs.map((d) => d.ref)
}

/**
 * Events, and what is kept of them, past their keeping (./eventRetention):
 *
 * - Availability, the day after: a date of a repeating event the day after
 *   that date — its standing "series" answer kept; a one-off event's, the
 *   day after its last day.
 * - Food sign-ups of a repeating event's dates over 12 months past.
 * - An event 12 months after its last day — a one-off's last date, a
 *   repeating one's end — deleted, and with it (./onEventDeleted) its tasks,
 *   answers, sign-ups, private record, invitations and pictures.
 * - Invitations' records 90 days after their date.
 * - Dates someone blocked off (./blockedDates), the day after the last of
 *   them: what they answered is gone by then, as above.
 *
 * Counts of what went, for the log.
 */
export async function cleanUpEventHistory(db: admin.firestore.Firestore, now: Date = new Date()) {
  const today = iowaToday(now)
  const keepFrom = monthsBefore(today, KEEP_EVENT_MONTHS)
  const done = { events: 0, availability: 0, foodSignups: 0, invites: 0, blockedDates: 0 }

  const events = await db.collection('events').get()
  for (const doc of events.docs) {
    const ev = doc.data()
    if (pastKeeping(ev, keepFrom)) {
      await doc.ref.delete()
      done.events++
      continue
    }
    // Availability: of each date of a series, once the date has gone; of a
    // one-off event — every day of it — once its last day has.
    const last = lastDayOf(ev)
    const availBefore = ev.isRec ? today : last && last < today ? '\uf8ff' : null
    if (availBefore) {
      const old = await datedBefore(db, 'avail', doc.id, availBefore)
      await deleteAll(db, old)
      done.availability += old.length
    }
    // Food sign-ups: kept the year, as the event is.
    if (ev.isRec) {
      const old = await datedBefore(db, 'foodSignups', doc.id, keepFrom)
      await deleteAll(db, old)
      done.foodSignups += old.length
    }
  }

  const inviteBefore = daysBefore(today, KEEP_INVITE_DAYS)
  for (;;) {
    const old = await db.collection('invites').where('date', '<', inviteBefore).limit(400).get()
    if (old.empty) break
    await deleteAll(
      db,
      old.docs.map((d) => d.ref)
    )
    done.invites += old.size
    if (old.size < 400) break
  }

  const blocksOver = await db.collection('blockedDates').where('to', '<', today).get()
  await deleteAll(
    db,
    blocksOver.docs.map((d) => d.ref)
  )
  done.blockedDates = blocksOver.size
  return done
}

/** Nightly, after midnight in Iowa: "the day after" is the church's day after. */
export const eventHistoryCleanup = onSchedule(
  { schedule: '15 3 * * *', timeZone: 'America/Chicago', timeoutSeconds: 540 },
  async () => {
    const done = await cleanUpEventHistory(admin.firestore())
    logger.info('[eventHistoryCleanup]', done)
  }
)
