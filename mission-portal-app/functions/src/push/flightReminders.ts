import { onSchedule } from 'firebase-functions/v2/scheduler'
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

interface FlightRaw {
  id?: string
  uid?: string | number
  outDate?: string
  outTime?: string
  outAirport?: string
  outAirline?: string
  outFlight?: string
  retDate?: string
  retTime?: string
  retAirport?: string
  retAirline?: string
  retFlight?: string
  /** Legs already reminded, so a leg never fires twice. */
  remindedLegs?: string[]
}

interface EventRaw {
  id?: string | number
  title?: string
  flightEntries?: FlightRaw[]
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

/**
 * Should this leg be reminded about now?
 *
 * True once we are inside the user's lead window and the flight has not
 * already left. The window has a floor so a leg is not missed when the
 * scheduler runs slightly late.
 */
export function isDue(departsAt: number, now: number, leadHours: number): boolean {
  const lead = leadHours * 60 * 60 * 1000
  const msUntil = departsAt - now
  return msUntil <= lead && msUntil > 0
}

/**
 * Flight reminders.
 *
 * Runs every 15 minutes because lead times are per-user and a coarser tick
 * would push someone's 3-hour reminder well off the mark. Each leg is
 * recorded on the event once sent so it never repeats.
 */
export const flightReminders = onSchedule(
  { schedule: '*/15 * * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore()
    const now = Date.now()

    const eventsSnap = await db.collection('events').get()
    const userCache = new Map<string, number>()

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as EventRaw
      const entries = event.flightEntries ?? []
      if (entries.length === 0) continue

      let changed = false
      const updated = entries.map((entry) => ({ ...entry }))

      for (const entry of updated) {
        const uid = entry.uid ? String(entry.uid) : ''
        if (!uid) continue

        if (!userCache.has(uid)) {
          const userSnap = await db.collection('users').doc(uid).get()
          userCache.set(uid, leadHoursFor(userSnap.data()?.flightReminderHours))
        }
        const leadHours = userCache.get(uid) ?? DEFAULT_LEAD_HOURS

        const legs = [
          {
            key: 'out',
            label: 'outbound flight',
            departsAt: parseDeparture(entry.outDate, entry.outTime),
            airport: entry.outAirport,
            time: entry.outTime,
          },
          {
            key: 'ret',
            label: 'return flight',
            departsAt: parseDeparture(entry.retDate, entry.retTime),
            airport: entry.retAirport,
            time: entry.retTime,
          },
        ]

        for (const leg of legs) {
          if (leg.departsAt === null) continue
          const legId = `${entry.id ?? 'f'}_${leg.key}`
          if ((entry.remindedLegs ?? []).includes(legId)) continue
          if (!isDue(leg.departsAt, now, leadHours)) continue

          await notifyUser(uid, 'flightReminder', {
            eventTitle: event.title ?? 'an event',
            legLabel: leg.label,
            departsAt: [leg.time, leg.airport].filter(Boolean).join(' from '),
            // Opens the event card, where the flight details live.
            link: `/(app)/events/${eventDoc.id}`,
          })

          entry.remindedLegs = [...(entry.remindedLegs ?? []), legId]
          changed = true
          logger.info(`flightReminders: notified ${uid} about ${legId}`)
        }
      }

      if (changed) {
        await eventDoc.ref.update({ flightEntries: updated })
      }
    }
  }
)
