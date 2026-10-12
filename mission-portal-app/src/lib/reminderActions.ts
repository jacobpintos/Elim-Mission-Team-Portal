import * as Notifications from 'expo-notifications'
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'

/**
 * A reminder's push has two buttons of its own — Snooze (an hour) and Done —
 * registered here under the name the server sends it with
 * (functions/src/push/notifyCore: categoryId 'reminder').
 */
export const REMINDER_SNOOZE = 'reminder-snooze'
export const REMINDER_DONE = 'reminder-done'
const SNOOZE_MS = 60 * 60 * 1000

export function registerReminderButtons(): void {
  Notifications.setNotificationCategoryAsync('reminder', [
    {
      identifier: REMINDER_SNOOZE,
      buttonTitle: 'Snooze 1 hour',
      options: { opensAppToForeground: true },
    },
    {
      identifier: REMINDER_DONE,
      buttonTitle: 'Done',
      options: { opensAppToForeground: true },
    },
  ]).catch(() => {})
}

/** One of those buttons, pressed: the reminder snoozed, or marked done. */
export async function reminderButton(action: string, reminderId: string): Promise<void> {
  const ref = doc(db, 'reminders', reminderId)
  const r = (await getDoc(ref)).data() as
    | { uid: string; text: string; repeat?: string; tz?: string }
    | undefined
  if (!r) return
  if (action === REMINDER_SNOOZE) {
    const remindAt = Date.now() + SNOOZE_MS
    if (r.repeat) {
      // A repeating one keeps its own times: snoozed as a one-off copy.
      await setDoc(doc(collection(db, 'reminders')), {
        uid: r.uid,
        text: r.text,
        remindAt,
        done: false,
        pending: true,
        tz: r.tz ?? null,
        createdAt: serverTimestamp(),
      })
    } else {
      await updateDoc(ref, { remindAt, done: false, pending: true })
    }
  } else if (action === REMINDER_DONE && !r.repeat) {
    await updateDoc(ref, { done: true, pending: false })
  }
}
