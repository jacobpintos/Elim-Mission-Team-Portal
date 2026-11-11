import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { ADMINS } from '../eventPrivate'
import { instancesOf, type EventTemplate } from '../miriam/data'
import { todayInOrg } from '../org'
import { notifyUser, type NotificationType } from './notifyCore'
import {
  answersToTell,
  availKeyParts,
  eventTellings,
  justReported,
  justResolved,
  peopleIn,
  taskTellings,
  type Telling,
} from './recordTellings'

if (!admin.apps.length) admin.initializeApp()

/**
 * People told of what changed, by the server, as it is written.
 *
 * Each of these used to be asked for by the app, after it had made the
 * change, through `sendNotification` (../notify) — which took who to tell
 * and what to say from the app, and so from anyone who called it. Here both
 * come from the record alone (./recordTellings): what a notification says
 * is what was written, and who it goes to is who the record names.
 */

type Doc = Record<string, unknown>
type Db = admin.firestore.Firestore

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

async function adminUids(db: Db): Promise<string[]> {
  const snap = await db.collection('users').where('roles', 'array-contains', 'admin').get()
  return snap.docs.map((d) => d.id)
}

/** One notification, never in the way of the next. */
async function tellOne(uid: string, type: NotificationType, data: Record<string, unknown>) {
  await notifyUser(uid, type, data).catch((err: unknown) =>
    logger.error('recordNotifications: not told', { uid, type, err })
  )
}

/** Each sent: one for every admin, to each of them. */
async function tell(db: Db, tellings: Telling[]) {
  if (!tellings.length) return
  const admins = tellings.some((t) => t.to === ADMINS) ? await adminUids(db) : []
  for (const t of tellings) {
    for (const uid of t.to === ADMINS ? admins : [t.to]) await tellOne(uid, t.type, t.data)
  }
}

const dataOf = (snap: { exists: boolean; data(): Doc | undefined } | undefined): Doc | undefined =>
  snap?.exists ? snap.data() : undefined

// --- Tasks ------------------------------------------------------------------

/** A task made, handed on, finished or fallen behind (./recordTellings taskTellings). */
export const onTaskWritten = onDocumentWritten('tasks/{taskId}', async (event) => {
  const after = dataOf(event.data?.after)
  if (!after) return
  const before = dataOf(event.data?.before)
  await tell(admin.firestore(), taskTellings(before, after, event.params.taskId))
})

// --- Events -----------------------------------------------------------------

/**
 * Where a notification about an event opens: its next date's page — or,
 * with none to come, its own date's, or the calendar. (As the app's
 * eventsStore eventLink.)
 */
function eventLink(id: string, ev: Doc): string {
  const { overrides, ...tmpl } = ev as Doc & { overrides?: Record<string, Partial<EventTemplate>> }
  const template = { ...(tmpl as unknown as EventTemplate), id }
  const next = instancesOf(template, todayInOrg(), '9999-12-31', overrides ?? {})[0]
  const key =
    next?.instanceKey ?? (!template.isRec && template.date ? `${id}_${template.date}` : null)
  return key ? `/(app)/events/${encodeURIComponent(key)}` : '/(app)/events'
}

/**
 * An event's private record written: who was put on the event or taken off
 * it, and who was given a flight, a room or a seat in a car
 * (./recordTellings eventTellings). The record holds who is on the event
 * (`access`) beside what they are given, so the two are compared as one.
 */
export const onEventPrivateWritten = onDocumentWritten('eventPrivate/{eventId}', async (event) => {
  const { joined, removed, given } = eventTellings(
    dataOf(event.data?.before),
    dataOf(event.data?.after)
  )
  if (!joined.length && !removed.length && !given.length) return
  const id = event.params.eventId
  const ev = (await admin.firestore().doc(`events/${id}`).get()).data()
  // Deleted with it, or a draft: its maker's alone, and nobody is told.
  if (!ev || ev.unpublished === true) return
  const eventTitle = str(ev.title) || 'an event'
  const link = eventLink(id, ev)
  const dates = (ev.overrides ?? {}) as Record<string, { title?: unknown } | undefined>
  for (const uid of joined) await tellOne(uid, 'eventJoin', { eventTitle, link })
  for (const uid of removed) await tellOne(uid, 'eventRemoved', { eventTitle })
  for (const g of given) {
    await tellOne(g.uid, 'eventLogistics', {
      eventTitle: (g.dateKey && str(dates[g.dateKey]?.title)) || eventTitle,
      itemLabel: g.itemLabel,
      link: g.dateKey ? `/(app)/events/${encodeURIComponent(g.dateKey)}` : link,
    })
  }
})

// --- Availability ------------------------------------------------------------

/**
 * Someone answered an event anything but "Available": the admins who are on
 * that event are told (./recordTellings answersToTell) — not the person
 * themselves, if they are one.
 */
export const onAvailWritten = onDocumentWritten('avail/{key}', async (event) => {
  const changed = answersToTell(dataOf(event.data?.before), dataOf(event.data?.after), Date.now())
  if (!changed.length) return
  const key = event.params.key
  const parts = availKeyParts(key)
  if (!parts) return
  const db = admin.firestore()
  const [evSnap, privateSnap, admins] = await Promise.all([
    db.doc(`events/${parts.eventId}`).get(),
    db.doc(`eventPrivate/${parts.eventId}`).get(),
    adminUids(db),
  ])
  const ev = evSnap.data()
  if (!ev || ev.unpublished === true) return
  const onIt = new Set(peopleIn(privateSnap.data()?.access))
  const adminsOnIt = admins.filter((uid) => onIt.has(uid))
  if (!adminsOnIt.length) return

  const dates = (ev.overrides ?? {}) as Record<string, { title?: unknown } | undefined>
  const eventTitle = (parts.date && str(dates[key]?.title)) || str(ev.title) || 'an event'
  // A date's own page; a whole series', its next date's.
  const page = parts.date
    ? `/(app)/events/${encodeURIComponent(key)}`
    : eventLink(parts.eventId, ev)
  const link = page === '/(app)/events' ? page : `${page}?focus=team_availability`

  for (const { uid, statusLabel } of changed) {
    const them = (await db.doc(`users/${uid}`).get()).data()
    const userName = str(them?.displayName) || str(them?.email) || 'Someone'
    for (const adminUid of adminsOnIt) {
      if (adminUid === uid) continue
      await tellOne(adminUid, 'rsvpNonAvailable', { userName, eventTitle, statusLabel, link })
    }
  }
})

// --- Conversations and reports -------------------------------------------------

/** A conversation reported by someone in it: the admins who didn't report it are told it needs review. */
export const onRoomReported = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = dataOf(event.data?.before)
  const after = dataOf(event.data?.after)
  if (!after || !justReported(before, after)) return
  const roomId = event.params.roomId
  const reporters = new Set(
    (Array.isArray(after.reviewers) ? after.reviewers : []).map((r) => str(r))
  )
  // A direct message has no name to give.
  const dm = after.kind === 'dm' || roomId.startsWith('dm_')
  for (const uid of await adminUids(admin.firestore())) {
    if (reporters.has(uid)) continue
    await tellOne(uid, 'chatFlagged', { roomName: dm ? '' : str(after.name), roomId })
  }
})

/**
 * A report on a message dealt with: whoever reported it is told it was, and
 * not how. What happened to another member is that member's business — the
 * reporter only needs to know it wasn't ignored.
 */
export const onContentReportResolved = onDocumentUpdated(
  'contentReports/{reportId}',
  async (event) => {
    const after = dataOf(event.data?.after)
    if (!after || !justResolved(dataOf(event.data?.before), after)) return
    const reporter = str(after.reporterUid)
    if (!reporter) return
    await tellOne(reporter, 'announcement', {
      title: 'Your report has been reviewed',
      link: '/(app)/messages',
    })
  }
)
