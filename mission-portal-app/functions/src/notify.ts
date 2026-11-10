import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { RESEND_API_KEY } from './email/client'
import { notifyUser } from './push/notifyCore'
import { mergeEvent } from './eventPrivate'
import { withinLimit, type UsageLimit } from './utils/usageLimit'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

/**
 * What the app used to call to notify someone: it sent whatever it was
 * handed — any kind of notification, in the caller's own words — to whoever
 * it named, and asked only that the caller be signed in. So anyone with a
 * login, a guest's or a public one included, could send anyone a "security
 * report" or a "reimbursement denied" that came from the real app.
 *
 * Nothing calls it now. What it sent is sent by the server, from the record
 * that changed (./push/recordNotifications, ./push/securityNotifications),
 * or by a function that checks who is asking and writes the words itself
 * (notifyWorshipTeams below, ./push/availabilityNudge, ./moderation/warnAuthor).
 *
 * It is kept, sending nothing, for two reasons: an app not yet updated still
 * calls it, and is refused rather than told a function is missing; and a
 * deploy stops when a function is gone from the source. Once every phone has
 * the update it can be deleted: `firebase functions:delete sendNotification`,
 * and this with it.
 */
export const sendNotification = onCall(async () => {
  throw new HttpsError(
    'failed-precondition',
    'Notifications are sent by the server now. Update the app.'
  )
})

/** Asking for this many set lists to be announced in ten minutes is not announcing set lists. */
const ANNOUNCE_LIMIT: UsageLimit = {
  name: 'notifyWorshipTeams',
  perWindow: 20,
  windowMs: 10 * 60 * 1000,
}

/**
 * A set list told to the worship team (src/features/worship/announceSetList):
 * everyone on worship is told there is a new one, and everyone on its
 * event's worship teams — any team whose name says "worship", so a "Worship
 * Band" member is told without the worship role — that it was set for them.
 *
 * Done here because only the server knows who is on worship (an account's
 * roles are its own and the admins' to read), and because an event's teams
 * are kept in its private record (./eventPrivate), which only those on it
 * and admins can read: the worship leader posting a set list may not be on
 * the event.
 *
 * Asked for by the set list's id, its name and event are read from its own
 * record. An app not yet updated sends the event and the name instead, as it
 * always has for the teams.
 */
export const notifyWorshipTeams = onCall({ secrets: [RESEND_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const caller = req.auth.uid
  const db = admin.firestore()
  const roles = ((await db.doc(`users/${caller}`).get()).data()?.roles ?? []) as string[]
  if (!roles.some((r) => r === 'admin' || r === 'worship')) {
    throw new HttpsError(
      'permission-denied',
      'Only the worship team and admins announce set lists.'
    )
  }
  const { setListId, eventTemplateId, setListTitle } = (req.data ?? {}) as {
    setListId?: unknown
    eventTemplateId?: unknown
    setListTitle?: unknown
  }
  const idOf = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  const listId = idOf(setListId)
  let eventId = idOf(eventTemplateId)
  let title = typeof setListTitle === 'string' ? setListTitle.slice(0, 200) : ''
  if (listId) {
    if (listId.includes('/')) throw new HttpsError('invalid-argument', 'Which set list?')
    const list = (await db.doc(`setLists/${listId}`).get()).data()
    if (!list) throw new HttpsError('not-found', 'That set list is no longer there.')
    title = String(list.title ?? '').slice(0, 200)
    eventId = idOf(list.eventTemplateId)
  } else if (!eventId) {
    throw new HttpsError('invalid-argument', 'Which set list?')
  }
  if (eventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?')
  const allowed = await withinLimit(db, caller, ANNOUNCE_LIMIT, {
    onError: (err) => logger.warn('notifyWorshipTeams: usage count unreachable', err),
  })
  if (!allowed) {
    throw new HttpsError('resource-exhausted', 'That’s a lot of set lists — try again soon.')
  }

  // Everyone on worship but the admins, who see every set list anyway — and
  // whoever is announcing it.
  const worship = await db.collection('users').where('roles', 'array-contains', 'worship').get()
  let told = 0
  for (const d of worship.docs) {
    const theirs = (d.data().roles ?? []) as unknown[]
    if (d.id === caller || theirs.includes('admin')) continue
    await notifyUser(d.id, 'announcement', { title: 'New Set List', link: '/(app)/worship' }).catch(
      (err) => logger.error('notifyWorshipTeams: not told', { uid: d.id, err })
    )
    told++
  }
  if (!eventId) return { told }

  const [open, closed] = await Promise.all([
    db.doc(`events/${eventId}`).get(),
    db.doc(`eventPrivate/${eventId}`).get(),
  ])
  if (!open.exists) return { told }
  const ev = mergeEvent(open.data() ?? {}, closed.data()) as {
    title?: string
    teams?: { name?: string; leaders?: unknown[]; members?: unknown[] }[]
  }
  const uids = new Set<string>()
  for (const team of ev.teams ?? []) {
    if (!team.name?.toLowerCase().includes('worship')) continue
    ;[...(team.leaders ?? []), ...(team.members ?? [])].forEach((m) => uids.add(String(m)))
  }
  for (const uid of uids) {
    await notifyUser(uid, 'worshipSetAssigned', {
      setListTitle: title || 'A set list',
      eventTitle: ev.title ?? 'an event',
      link: '/(app)/worship',
    }).catch((err) => logger.error('notifyWorshipTeams: not told', { uid, err }))
  }
  return { told: told + uids.size }
})
