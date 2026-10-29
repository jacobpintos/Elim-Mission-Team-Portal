import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'
import { clockOf, nextOccurrence, zonedTime, type Repeat } from './reminderTime'
import { instancesOf, type EventTemplate, type Group } from '../miriam/data'
import { mergeEvent } from '../eventPrivate'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import {
  beforeEventSaid,
  nextBeforeEvent,
  sentWith,
  type EveryEventRule,
  type StoredEvent,
} from './everyEvent'

if (!admin.apps.length) admin.initializeApp()

/** Missed by more than this (the job down a while): dropped, not sent late. */
const TOO_LATE_MS = 12 * 60 * 60 * 1000

/** Every event and group, as a reminder before every event needs them: read once a run. */
async function eventsAndGroups(db: admin.firestore.Firestore) {
  const [events, closed, groups] = await Promise.all([
    db.collection('events').get(),
    // Its teams are in its private record (../eventPrivate): who is on it.
    db.collection('eventPrivate').get(),
    db.collection('groups').get(),
  ])
  const privateOf = new Map(closed.docs.map((d) => [d.id, d.data()]))
  return {
    events: events.docs.map((d) => ({
      ...(mergeEvent(d.data(), privateOf.get(d.id)) as StoredEvent),
      id: d.id,
    })),
    groups: groups.docs.map((d) => ({ ...(d.data() as Group), id: d.id })),
  }
}

/** What a reminder before every event is set to: its next event, or none for now. */
function setTo(next: ReturnType<typeof nextBeforeEvent>) {
  return next
    ? { ...next, pending: true }
    : {
        remindAt: 0,
        pending: false,
        eventKey: admin.firestore.FieldValue.delete(),
        eventTemplateId: admin.firestore.FieldValue.delete(),
        eventTitle: admin.firestore.FieldValue.delete(),
      }
}

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
    // Read only when a reminder before every event comes due.
    let world: Awaited<ReturnType<typeof eventsAndGroups>> | null = null
    for (const doc of snap.docs) {
      const r = doc.data() as EveryEventRule & {
        uid?: string
        text?: string
        remindAt?: number
        done?: boolean
        repeat?: Repeat
        tz?: string
        everyEvent?: boolean
        eventKey?: string
        eventTitle?: string
      }
      if (typeof r.remindAt !== 'number' || r.remindAt > now) continue
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref)
        const f = fresh.data()
        // Moved on meanwhile (refreshEveryEventReminders): not due after all.
        if (!fresh.exists || f?.pending !== true || (f?.remindAt ?? 0) > now) return false
        // A repeating one is set for its next time as it is sent; one before
        // every event, once sent, for its next event (below); any other is done with.
        tx.update(
          doc.ref,
          r.repeat
            ? {
                remindAt: nextOccurrence(r.remindAt as number, r.repeat, r.tz, now),
                done: false,
                sentAt: now,
              }
            : r.everyEvent
              ? { pending: false, sentAt: now, sentKeys: sentWith(r.sentKeys, r.eventKey) }
              : { pending: false, sentAt: now }
        )
        return true
      })
      if (!claimed) continue
      if (r.done || !r.uid) {
        // Ticked off for this one: skipped, and on to the next.
      } else if (now - r.remindAt > TOO_LATE_MS) {
        logger.warn('sendDueReminders: too late to send', { id: doc.id })
      } else {
        try {
          await notifyUser(
            r.uid,
            'reminder',
            r.everyEvent && r.eventKey
              ? {
                  text: beforeEventSaid(r, r.eventTitle ?? 'Your event'),
                  link: `/events/${encodeURIComponent(r.eventKey)}`,
                  reminderId: doc.id,
                }
              : { text: r.text ?? '', link: '/assignments', reminderId: doc.id },
            { immediate: true }
          )
        } catch (err) {
          logger.error('sendDueReminders: failed', { id: doc.id, err })
        }
      }
      if (r.everyEvent) {
        try {
          world ??= await eventsAndGroups(db)
          const rule = { ...r, sentKeys: sentWith(r.sentKeys, r.eventKey) }
          const next = nextBeforeEvent(rule, world.events, world.groups, now)
          await doc.ref.update({ ...setTo(next), done: false })
        } catch (err) {
          // refreshEveryEventReminders sets it on its next run.
          logger.error('sendDueReminders: next event not set', { id: doc.id, err })
        }
      }
    }
  }
)

/**
 * Reminders before every event kept on their next event: one added since,
 * moved, called off, or a group they joined — every quarter of an hour.
 * With none set, a single read.
 */
export const refreshEveryEventReminders = onSchedule('every 15 minutes', async () => {
  const db = admin.firestore()
  const rules = await db.collection('reminders').where('everyEvent', '==', true).get()
  if (rules.empty) return
  const world = await eventsAndGroups(db)
  const now = Date.now()
  for (const doc of rules.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref)
        const r = fresh.data() as
          | (EveryEventRule & {
              everyEvent?: boolean
              pending?: boolean
              remindAt?: number
              sentAt?: number
              eventKey?: string
            })
          | undefined
        if (!r?.everyEvent) return
        // Due or just sent: sendDueReminders has it.
        if (r.pending === true && (r.remindAt ?? 0) <= now) return
        const next = nextBeforeEvent(r, world.events, world.groups, Math.max(now, r.sentAt ?? 0))
        if (
          next
            ? r.pending === true && r.remindAt === next.remindAt && r.eventKey === next.eventKey
            : r.pending !== true
        ) {
          return
        }
        tx.update(doc.ref, {
          ...setTo(next),
          // Ticked off for one event: not for another.
          ...(next?.eventKey !== r.eventKey ? { done: false } : {}),
        })
      })
    } catch (err) {
      logger.error('refreshEveryEventReminders: failed', { id: doc.id, err })
    }
  }
})

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
