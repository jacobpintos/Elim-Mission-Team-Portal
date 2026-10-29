import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { RESEND_API_KEY } from './email/client'
import { notifyUser, type NotificationType } from './push/notifyCore'
import { mergeEvent } from './eventPrivate'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

interface NotificationPayload {
  uid: string
  type: NotificationType
  data: Record<string, unknown>
}

export const sendNotification = onCall({ secrets: [RESEND_API_KEY] }, async (req) => {
  const { uid, type, data } = req.data as NotificationPayload

  if (!req.auth) {
    throw new Error('unauthenticated')
  }

  const userSnap = await admin.firestore().doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    throw new Error('user-not-found')
  }

  logger.info(`sendNotification: uid=${uid} type=${type}`)
  await notifyUser(uid, type, data)

  return { ok: true }
})

/**
 * Everyone on an event's worship teams — any team whose name says
 * "worship", so a "Worship Band" member is told without the worship role —
 * told of a set list for it (src/features/worship/announceSetList).
 *
 * Done here because an event's teams are kept in its private record
 * (./eventPrivate), which only those on it and admins can read: the worship
 * leader posting a set list may not be on the event.
 */
export const notifyWorshipTeams = onCall({ secrets: [RESEND_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const db = admin.firestore()
  const roles = ((await db.doc(`users/${req.auth.uid}`).get()).data()?.roles ?? []) as string[]
  if (!roles.some((r) => r === 'admin' || r === 'worship')) {
    throw new HttpsError(
      'permission-denied',
      'Only the worship team and admins announce set lists.'
    )
  }
  const { eventTemplateId, setListTitle } = (req.data ?? {}) as {
    eventTemplateId?: unknown
    setListTitle?: unknown
  }
  const id =
    typeof eventTemplateId === 'string' || typeof eventTemplateId === 'number'
      ? String(eventTemplateId)
      : ''
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Which event?')
  const [open, closed] = await Promise.all([
    db.doc(`events/${id}`).get(),
    db.doc(`eventPrivate/${id}`).get(),
  ])
  if (!open.exists) return { told: 0 }
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
      setListTitle: typeof setListTitle === 'string' ? setListTitle.slice(0, 200) : 'A set list',
      eventTitle: ev.title ?? 'an event',
    }).catch((err) => logger.error('notifyWorshipTeams: not told', { uid, err }))
  }
  return { told: uids.size }
})
