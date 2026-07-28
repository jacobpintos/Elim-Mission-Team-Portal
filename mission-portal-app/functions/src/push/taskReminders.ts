import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

interface TaskRaw {
  id?: string | number
  title?: string
  assignees?: (string | number)[]
  status?: string
  dueDate?: string | null
  projectedDate?: string | null
  notifiedDueWeekAt?: string | null
  notifiedDueTodayAt?: string | null
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Daily task due reminders.
 *
 * Per spec: notify assignees 1 week before and on the day a task is due.
 * If a task has a projectedDate, that date REPLACES dueDate as the basis for
 * both reminders (the stated exception). Already-done tasks are skipped, and
 * each reminder is written back to the task doc so a given task never sends
 * the same reminder twice.
 */
export const taskDueReminders = onSchedule(
  { schedule: '0 14 * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore()
    const today = todayStr()
    const weekOut = addDays(today, 7)

    const snap = await db.collection('tasks').get()

    for (const doc of snap.docs) {
      const task = doc.data() as TaskRaw
      if (task.status === 'done') continue

      // projectedDate takes precedence over dueDate when present.
      const effectiveDate = task.projectedDate || task.dueDate
      if (!effectiveDate) continue

      const assignees = (task.assignees ?? []).map(String).filter(Boolean)
      if (assignees.length === 0) continue

      const isDueToday = effectiveDate === today
      const isDueInAWeek = effectiveDate === weekOut

      // Dedup against the exact date the reminder covers, so a shifted
      // projectedDate correctly re-arms the reminder for the new date.
      const alreadySentToday = task.notifiedDueTodayAt === effectiveDate
      const alreadySentWeek = task.notifiedDueWeekAt === effectiveDate

      if (isDueToday && !alreadySentToday) {
        for (const uid of assignees) {
          await notifyUser(uid, 'taskDueSoon', {
            taskTitle: task.title ?? 'A task',
            taskId: String(task.id ?? doc.id),
            dueToday: true,
          })
        }
        await doc.ref.update({ notifiedDueTodayAt: effectiveDate })
        logger.info(`taskDueReminders: due-today sent for task ${doc.id}`)
      } else if (isDueInAWeek && !alreadySentWeek) {
        for (const uid of assignees) {
          await notifyUser(uid, 'taskDueSoon', {
            taskTitle: task.title ?? 'A task',
            taskId: String(task.id ?? doc.id),
            dueToday: false,
          })
        }
        await doc.ref.update({ notifiedDueWeekAt: effectiveDate })
        logger.info(`taskDueReminders: 1-week sent for task ${doc.id}`)
      }
    }
  }
)
