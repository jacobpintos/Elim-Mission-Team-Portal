import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { notifyUser } from './notifyCore'
import { eventsToRead, healthChanges, type HealthEvent, type HealthTask } from './eventHealthPlan'

if (!admin.apps.length) admin.initializeApp()

/** Events asked for at once. */
const GET_ALL_CHUNK = 300

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Event health transition detector.
 *
 * The client computes event health live from task state and never persists it,
 * so there was no discrete "on-time -> behind" moment to react to. This job
 * recomputes health per event, stores it in eventHealthState/{eventId}, and
 * notifies admins only on the transition INTO behind (not on every run while
 * it stays behind).
 */
export const eventHealthCheck = onSchedule({ schedule: '0 15 * * *' }, async () => {
  const db = admin.firestore()
  const today = todayStr()

  // The tasks still to do, the events last found behind, and the admins: not
  // every event and task kept (./eventHealthPlan).
  const [openSnap, behindSnap, adminsSnap] = await Promise.all([
    db.collection('tasks').where('status', '!=', 'done').get(),
    db.collection('eventHealthState').where('behind', '==', true).get(),
    db.collection('users').where('roles', 'array-contains', 'admin').get(),
  ])

  const adminUids = adminsSnap.docs.map((d) => d.id)
  if (adminUids.length === 0) return

  const openTasks = openSnap.docs.map((d) => d.data() as HealthTask)
  const behind = new Set(behindSnap.docs.map((d) => d.id))
  const ids = eventsToRead(openTasks, behind)
  const events: HealthEvent[] = []
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((id) => db.doc(`events/${id}`))
    for (const snap of await db.getAll(...refs)) {
      if (snap.exists) events.push({ ...(snap.data() as Omit<HealthEvent, 'id'>), id: snap.id })
    }
  }

  for (const change of healthChanges(events, openTasks, behind, today)) {
    await db.doc(`eventHealthState/${change.id}`).set({
      behind: change.behind,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    // Only notify on the on-time -> behind transition.
    if (!change.newlyBehind) continue
    for (const uid of adminUids) {
      await notifyUser(uid, 'eventHealthBehind', {
        eventTitle: change.title,
        eventId: change.id,
        // The list, not the card. Opening a card needs an instance key —
        // templateId_date — and the health check reads the template only,
        // so it has no date to build one from.
        link: '/(app)/events',
      })
    }
    logger.info(`eventHealthCheck: ${change.id} transitioned to behind`)
  }
})
