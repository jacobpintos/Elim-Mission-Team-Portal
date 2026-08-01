import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/** Days before the event that the "items still open" nudge goes out. */
const REMINDER_DAYS = 3

interface EventRaw {
  id?: string | number
  title?: string
  date?: string
  food?: boolean
  foodItems?: string[]
  users?: (string | number)[]
  groups?: string[]
  teams?: { leaders?: (string | number)[]; members?: (string | number)[] }[]
}

/** The date, N days from `from`, as YYYY-MM-DD. */
export function dateInDays(from: Date, days: number): string {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Which item indexes nobody has claimed.
 *
 * Blank rows are ignored — the form starts an event with one empty item, and
 * an empty string is not something anyone can bring.
 */
export function openItemIndexes(
  items: string[],
  signups: Record<string, unknown> | undefined
): number[] {
  return items
    .map((label, i) => ({ label, i }))
    .filter(({ label, i }) => label.trim() !== '' && !signups?.[String(i)])
    .map(({ i }) => i)
}

/** Everyone the event reaches, via direct users, groups or teams. */
async function inviteeUids(db: admin.firestore.Firestore, event: EventRaw): Promise<Set<string>> {
  const uids = new Set<string>()
  ;(event.users ?? []).forEach((u) => uids.add(String(u)))
  ;(event.teams ?? []).forEach((t) => {
    ;(t.leaders ?? []).forEach((u) => uids.add(String(u)))
    ;(t.members ?? []).forEach((u) => uids.add(String(u)))
  })
  for (const groupId of event.groups ?? []) {
    const snap = await db.collection('groups').doc(String(groupId)).get()
    ;((snap.data()?.members as (string | number)[]) ?? []).forEach((u) => uids.add(String(u)))
  }
  return uids
}

/**
 * Nudge people who have not claimed a food item.
 *
 * Runs once a day and looks only at events exactly REMINDER_DAYS out, so a
 * given event nudges once rather than every day of the week before it.
 * Nothing is sent when every item is already claimed — the point is the open
 * ones. Guests are skipped; they are not asked to bring food.
 */
export const foodSignupReminders = onSchedule(
  { schedule: '0 15 * * *', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore()
    const targetDate = dateInDays(new Date(), REMINDER_DAYS)

    const eventsSnap = await db.collection('events').where('date', '==', targetDate).get()

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as EventRaw
      if (!event.food) continue

      const items = event.foodItems ?? []
      if (items.length === 0) continue

      const foodKey = `${eventDoc.id}_${event.date}`
      const signupSnap = await db.collection('foodSignups').doc(foodKey).get()
      const signups = (signupSnap.data()?.signups as Record<string, { uid?: string }>) ?? {}

      const open = openItemIndexes(items, signups)
      if (open.length === 0) continue

      const claimedBy = new Set(Object.values(signups).map((s) => String(s?.uid ?? '')))
      const uids = await inviteeUids(db, event)

      for (const uid of uids) {
        // Already bringing something — no nudge needed.
        if (claimedBy.has(uid)) continue

        const userSnap = await db.collection('users').doc(uid).get()
        const roles = (userSnap.data()?.roles as string[]) ?? []
        if (roles.includes('guest')) continue

        await notifyUser(uid, 'foodSignupReminder', {
          eventTitle: event.title ?? 'an event',
          openCount: open.length,
          link: `/(app)/events/${eventDoc.id}_${event.date}`,
        })
      }

      logger.info(
        `foodSignupReminders: ${eventDoc.id} has ${open.length} open item(s), nudged invitees`
      )
    }
  }
)
