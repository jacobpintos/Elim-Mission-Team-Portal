import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { UserProfile } from '@/types/user'
import { isAdmin } from '@/lib/roles'

/**
 * Task notifications.
 *
 * Both of these types have existed in the Cloud Function and in the Settings
 * preference list from the start; what was missing was anything calling them.
 * They live here rather than beside one screen because each fires from more
 * than one place — a task can be created from the Assign Task flow or spawned
 * from an event's task template, and either has to notify the same way.
 */

/** Tell each assignee they were given a task. */
export function notifyAssignees(
  assignees: (string | number)[],
  taskTitle: string,
  taskId: string | number
) {
  const sendNotif = httpsCallable(functions, 'sendNotification')
  assignees.forEach((assigneeUid) => {
    sendNotif({
      uid: String(assigneeUid),
      type: 'newAssignment',
      data: { taskId: String(taskId), taskTitle },
    }).catch(() => {})
  })
}

/**
 * Tell the admins a task has fallen behind.
 *
 * Marking a task behind already moved the event's health indicator, but the
 * admins who would act on it were never told — they had to notice the
 * indicator themselves.
 */
export function notifyAdminsTaskBehind(
  users: UserProfile[],
  taskTitle: string,
  taskId: string | number,
  reportedBy: string
) {
  const sendNotif = httpsCallable(functions, 'sendNotification')
  users
    .filter(isAdmin)
    // Whoever flagged it does not need telling.
    .filter((u) => String(u.uid) !== reportedBy)
    .forEach((u) => {
      sendNotif({
        uid: String(u.uid),
        type: 'eventHealthBehind',
        data: { taskId: String(taskId), taskTitle },
      }).catch(() => {})
    })
}
