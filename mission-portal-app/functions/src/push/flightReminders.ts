import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import { getFunctions } from 'firebase-admin/functions'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/** Hours before departure a reminder goes out when the user has not chosen. */
const DEFAULT_LEAD_HOURS = 3

/** Bounds on the user-chosen lead time, so a bad value cannot silence or spam. */
const MIN_LEAD_HOURS = 1
const MAX_LEAD_HOURS = 48

const QUEUE = 'flightReminderTask'

interface FlightRaw {
  id?: string
  uid?: string | number
  outDate?: string
  outTime?: string
  outAirport?: string
  retDate?: string
  retTime?: string
  retAirport?: string
  /**
   * When a reminder is currently scheduled for each leg, as an epoch ms.
   * A dispatched task compares against this; if it no longer matches, the
   * flight moved after the task was queued and the task is stale.
   */
  reminderScheduledFor?: Record<string, number>
}

interface EventRaw {
  title?: string
  date?: string
  flightEntries?: FlightRaw[]
}

interface ReminderPayload {
  eventId: string
  entryId: string
  leg: 'out' | 'ret'
  scheduledFor: number
}

/**
 * Parse a flight leg's departure into a timestamp.
 *
 * Dates are stored as YYYY-MM-DD and times as free text typed by a
 * coordinator, so this accepts the common shapes — "14:05", "2:05 PM",
 * "2:05pm" — and gives up rather than guessing on anything else. A leg we
 * cannot read is skipped, which is the safe direction: a missing reminder
 * beats one at three in the morning.
 */
export function parseDeparture(date?: string, time?: string): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!time) return null

  const match = time
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]

  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'pm' && hour !== 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
  } else if (hour > 23) {
    return null
  }

  const ts = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
  )
  return Number.isNaN(ts) ? null : ts
}

/** Clamp a stored preference into something sane. */
export function leadHoursFor(stored: unknown): number {
  // Number(null) is 0 and Number('') is 0, both of which are finite — without
  // this guard an unset preference clamped to the minimum instead of falling
  // back to the default, quietly giving those users a one-hour warning.
  if (stored === null || stored === undefined || stored === '') return DEFAULT_LEAD_HOURS
  const n = typeof stored === 'number' ? stored : Number(stored)
  if (!Number.isFinite(n)) return DEFAULT_LEAD_HOURS
  return Math.min(MAX_LEAD_HOURS, Math.max(MIN_LEAD_HOURS, Math.round(n)))
}

/** The legs of an entry that have a readable departure still in the future. */
export function upcomingLegs(entry: FlightRaw, now: number) {
  return (
    [
      { leg: 'out' as const, label: 'outbound flight', date: entry.outDate, time: entry.outTime },
      { leg: 'ret' as const, label: 'return flight', date: entry.retDate, time: entry.retTime },
    ]
      .map((l) => ({ ...l, departsAt: parseDeparture(l.date, l.time) }))
      // A leg that cannot be read, or has already gone, needs no reminder.
      .filter((l): l is typeof l & { departsAt: number } => l.departsAt !== null && l.departsAt > now)
  )
}

async function leadHoursForUser(db: admin.firestore.Firestore, uid: string): Promise<number> {
  const snap = await db.collection('users').doc(uid).get()
  return leadHoursFor(snap.data()?.flightReminderHours)
}

/**
 * Queue reminders when a flight is written, rather than sweeping for them.
 *
 * Nothing needs to run in between: the reminder is scheduled the moment a
 * flight is entered and re-scheduled if it moves. Each leg records the time
 * its reminder is queued for, and a dispatched task that finds a different
 * time knows the flight changed underneath it and stops.
 */
export const onFlightWritten = onDocumentWritten('events/{eventId}', async (event) => {
  const db = admin.firestore()
  const after = event.data?.after?.data() as EventRaw | undefined
  if (!after) return

  const now = Date.now()
  const entries = after.flightEntries ?? []
  if (entries.length === 0) return

  const updated = entries.map((e) => ({ ...e }))
  let changed = false

  for (const entry of updated) {
    const uid = entry.uid ? String(entry.uid) : ''
    if (!uid) continue

    const leadHours = await leadHoursForUser(db, uid)
    const scheduled: Record<string, number> = { ...(entry.reminderScheduledFor ?? {}) }

    for (const leg of upcomingLegs(entry, now)) {
      const fireAt = leg.departsAt - leadHours * 60 * 60 * 1000
      // Already queued for this exact moment — the write that reaches here
      // after our own update is the common case, and must not re-queue.
      if (scheduled[leg.leg] === fireAt) continue

      const payload: ReminderPayload = {
        eventId: event.params.eventId,
        entryId: String(entry.id ?? 'f'),
        leg: leg.leg,
        scheduledFor: fireAt,
      }

      await getFunctions()
        .taskQueue<ReminderPayload>(QUEUE)
        .enqueue(payload, {
          // A departure already inside the lead window fires immediately.
          scheduleTime: new Date(Math.max(fireAt, now + 1000)),
        })

      scheduled[leg.leg] = fireAt
      changed = true
      logger.info(
        `onFlightWritten: queued ${payload.entryId}_${leg.leg} for ${new Date(fireAt).toISOString()}`
      )
    }

    entry.reminderScheduledFor = scheduled
  }

  if (changed) {
    await event.data!.after!.ref.update({ flightEntries: updated })
  }
})

/**
 * Send one flight reminder.
 *
 * The lead time is read here rather than trusted from the queued task, so a
 * user who changed it after booking still gets the reminder they asked for:
 * if the task arrives early the handler re-queues itself for the right
 * moment, and if it arrives late it sends anyway.
 */
export const flightReminderTask = onTaskDispatched<ReminderPayload>(
  { retryConfig: { maxAttempts: 3 }, secrets: [RESEND_API_KEY] },
  async (req) => {
    const { eventId, entryId, leg, scheduledFor } = req.data
    const db = admin.firestore()

    const eventSnap = await db.collection('events').doc(eventId).get()
    const event = eventSnap.data() as EventRaw | undefined
    if (!event) return

    const entry = (event.flightEntries ?? []).find((e) => String(e.id ?? 'f') === entryId)
    if (!entry) return

    // The flight moved after this task was queued; a newer task owns it.
    if (entry.reminderScheduledFor?.[leg] !== scheduledFor) {
      logger.info(`flightReminderTask: ${entryId}_${leg} superseded, dropping`)
      return
    }

    const uid = entry.uid ? String(entry.uid) : ''
    if (!uid) return

    const departsAt = parseDeparture(
      leg === 'out' ? entry.outDate : entry.retDate,
      leg === 'out' ? entry.outTime : entry.retTime
    )
    if (departsAt === null || departsAt <= Date.now()) return

    const leadHours = await leadHoursForUser(db, uid)
    const wantAt = departsAt - leadHours * 60 * 60 * 1000

    // The user lengthened their lead time after this was queued, so it is not
    // due yet — put it back for the moment they actually asked for.
    if (Date.now() < wantAt - 60 * 1000) {
      await getFunctions()
        .taskQueue<ReminderPayload>(QUEUE)
        .enqueue(
          { eventId, entryId, leg, scheduledFor: wantAt },
          { scheduleTime: new Date(wantAt) }
        )
      await eventSnap.ref.update({
        flightEntries: (event.flightEntries ?? []).map((e) =>
          String(e.id ?? 'f') === entryId
            ? { ...e, reminderScheduledFor: { ...(e.reminderScheduledFor ?? {}), [leg]: wantAt } }
            : e
        ),
      })
      return
    }

    await notifyUser(uid, 'flightReminder', {
      eventTitle: event.title ?? 'an event',
      legLabel: leg === 'out' ? 'outbound flight' : 'return flight',
      departsAt: [
        leg === 'out' ? entry.outTime : entry.retTime,
        leg === 'out' ? entry.outAirport : entry.retAirport,
      ]
        .filter(Boolean)
        .join(' from '),
      // Opens the event card, where the flight details live.
      link: `/(app)/events/${eventId}`,
    })

    logger.info(`flightReminderTask: notified ${uid} about ${entryId}_${leg}`)
  }
)
