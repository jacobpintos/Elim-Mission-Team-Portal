import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { requireAdmin } from '../owner'
import { withinLimit, type UsageLimit } from '../utils/usageLimit'
import { notifyUser } from './notifyCore'
import { availKeyParts, peopleIn } from './recordTellings'

if (!admin.apps.length) admin.initializeApp()

/** As many as an admin's briefing could ask for in a morning, and no more. */
const LIMIT: UsageLimit = { name: 'nudgeAvailability', perWindow: 20, windowMs: 10 * 60 * 1000 }

/** More people than are on any one event. */
const MAX_PEOPLE = 300

/**
 * Those on an event's date who haven't answered its availability, asked to
 * (an admin's briefing: src/features/miriam/briefingData remindToAnswer).
 *
 * The app says which date and who; the server checks the caller is an admin
 * and that each of them is on the event, and writes what they are sent —
 * the event's name and the day — from the event itself.
 */
export const nudgeAvailability = onCall(async (req) => {
  const caller = await requireAdmin(req.auth?.uid)
  const key = typeof req.data?.eventKey === 'string' ? req.data.eventKey.slice(0, 200) : ''
  const parts = key.includes('/') ? null : availKeyParts(key)
  if (!parts?.date) throw new HttpsError('invalid-argument', 'Which event, on which day?')
  const asked: string[] = [
    ...new Set<string>(
      (Array.isArray(req.data?.uids) ? req.data.uids : []).filter(
        (u: unknown): u is string => typeof u === 'string' && !!u
      )
    ),
  ].slice(0, MAX_PEOPLE)
  if (!asked.length) return { told: 0 }

  const db = admin.firestore()
  const allowed = await withinLimit(db, caller, LIMIT, {
    onError: (err) => logger.warn('nudgeAvailability: usage count unreachable', err),
  })
  if (!allowed) {
    throw new HttpsError('resource-exhausted', 'That’s a lot of reminders — try again soon.')
  }

  const [evSnap, privateSnap] = await Promise.all([
    db.doc(`events/${parts.eventId}`).get(),
    db.doc(`eventPrivate/${parts.eventId}`).get(),
  ])
  const ev = evSnap.data()
  if (!ev || ev.unpublished === true) {
    throw new HttpsError('not-found', 'That event is no longer there.')
  }
  const onIt = new Set(peopleIn(privateSnap.data()?.access))
  const dates = (ev.overrides ?? {}) as Record<string, { title?: unknown } | undefined>
  const own = dates[key]?.title
  const eventTitle = (typeof own === 'string' && own) || String(ev.title ?? 'an event')
  const eventDate = new Date(`${parts.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const link = `/events/${encodeURIComponent(key)}?focus=availability`

  let told = 0
  for (const uid of asked) {
    if (!onIt.has(uid)) continue
    await notifyUser(uid, 'availabilityNudge', { eventTitle, eventDate, link }).catch(
      (err: unknown) => logger.error('nudgeAvailability: not told', { uid, err })
    )
    told++
  }
  return { told }
})
