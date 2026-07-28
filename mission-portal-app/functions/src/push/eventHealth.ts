import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

interface TaskRaw {
  status?: string
  dueDate?: string | null
  projectedDate?: string | null
  evId?: string | number | null
  evTemplateId?: string | number | null
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** Mirrors the client's isOverdue(): past its effective date and not done. */
function isOverdue(task: TaskRaw, today: string): boolean {
  const effectiveDate = task.projectedDate || task.dueDate
  return !!(effectiveDate && task.status !== 'done' && effectiveDate < today)
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
export const eventHealthCheck = onSchedule(
  { schedule: '0 15 * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore()
    const today = todayStr()

    const [eventsSnap, tasksSnap, adminsSnap] = await Promise.all([
      db.collection('events').get(),
      db.collection('tasks').get(),
      db.collection('users').where('roles', 'array-contains', 'admin').get(),
    ])

    const adminUids = adminsSnap.docs.map((d) => d.id)
    if (adminUids.length === 0) return

    const tasks = tasksSnap.docs.map((d) => d.data() as TaskRaw)

    for (const evDoc of eventsSnap.docs) {
      const ev = evDoc.data() as { title?: string; taskTemplateId?: string; deleted?: boolean }
      if (ev.deleted || !ev.taskTemplateId) continue

      const evTasks = tasks.filter(
        (t) =>
          String(t.evId ?? '') === evDoc.id ||
          String(t.evTemplateId ?? '') === evDoc.id
      )
      if (evTasks.length === 0) continue

      const isBehind = evTasks.some((t) => t.status === 'behind' || isOverdue(t, today))

      const stateRef = db.doc(`eventHealthState/${evDoc.id}`)
      const prevState = (await stateRef.get()).data() as { behind?: boolean } | undefined
      const wasBehind = prevState?.behind === true

      if (isBehind !== wasBehind) {
        await stateRef.set({
          behind: isBehind,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      // Only notify on the on-time -> behind transition.
      if (isBehind && !wasBehind) {
        for (const uid of adminUids) {
          await notifyUser(uid, 'eventHealthBehind', {
            eventTitle: ev.title ?? 'An event',
            eventId: evDoc.id,
          })
        }
        logger.info(`eventHealthCheck: ${evDoc.id} transitioned to behind`)
      }
    }
  }
)
