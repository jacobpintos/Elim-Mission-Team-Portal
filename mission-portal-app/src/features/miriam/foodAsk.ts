import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import type { EventInstance } from '../../../functions/src/miriam/data'
import { answered } from './briefingData'

/** An event's food sheet as it stands: what is still open, by name. Null when it can't be read. */
export async function openFood(ev: EventInstance): Promise<string[] | null> {
  try {
    const signups = ((await getDoc(doc(db, 'foodSignups', `${ev.templateId}_${ev.date}`))).data()
      ?.signups ?? {}) as Record<string, unknown>
    return (ev.foodItems ?? []).filter((item, i) => item && !signups[String(i)])
  } catch {
    return null
  }
}

/**
 * The next of these events with food still open — leaving out any they have
 * said they can't come to, as the briefing does. Null when there is none.
 */
export async function nextOpenFood(
  events: EventInstance[],
  uid: string
): Promise<{ ev: EventInstance; open: string[] } | null> {
  // In date order, a few at a time: the first one found is the one wanted.
  for (const ev of events.slice(0, 12)) {
    const open = await openFood(ev)
    if (!open?.length) continue
    if ((await answered(ev, uid).catch(() => null))?.status === 'no') continue
    return { ev, open }
  }
  return null
}
