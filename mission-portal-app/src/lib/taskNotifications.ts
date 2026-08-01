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
  taskId: string | number
) {
  const sendNotif = httpsCallable(functions, 'sendNotification')
  users
    // Every admin, including whoever flagged it. Skipping the actor looks
    // sensible until you are the one admin on the portal — then flagging a
    // task behind notifies nobody, which is indistinguishable from the
    // notification being broken.
    .filter(isAdmin)
    .forEach((u) => {
      sendNotif({
        uid: String(u.uid),
        type: 'eventHealthBehind',
        data: { taskId: String(taskId), taskTitle },
      }).catch(() => {})
    })
}

/** A travel detail assigned to someone on an event. */
export interface LogisticsAssignment {
  uid: string
  /** What they were given, e.g. "A flight" or "Hotel Ibis, room 12". */
  itemLabel: string
}

/**
 * Tell people about a flight, hotel room, carpool seat or food item they were
 * just given on an event.
 *
 * Only the assignments that are new since the last save are passed in — an
 * event gets edited repeatedly, and re-announcing the same hotel room on every
 * save would train people to ignore these.
 */
export function notifyLogisticsAssigned(
  assignments: LogisticsAssignment[],
  eventTitle: string,
  instanceKey: string
) {
  const sendNotif = httpsCallable(functions, 'sendNotification')
  assignments.forEach(({ uid, itemLabel }) => {
    sendNotif({
      uid: String(uid),
      type: 'eventLogistics',
      data: {
        eventTitle,
        itemLabel,
        // Tapping the notification opens the event card it refers to.
        link: `/(app)/events/${instanceKey}`,
      },
    }).catch(() => {})
  })
}
