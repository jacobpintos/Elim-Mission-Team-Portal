import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import type { Announcement, Message, Room } from '@/types/events'
import type { EventInstance } from '../../../functions/src/miriam/data'
import { answered } from './briefingData'

/**
 * What Miriam's on-device conversations (./localTalk) read, as the person
 * signed in — so the database's rules decide what comes back, as they do for
 * the screens.
 */

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

/** A Firestore time, or a number, as milliseconds. */
const millis = (v: unknown): number => {
  if (typeof v === 'number') return v
  const t = v as { toMillis?: () => number; seconds?: number } | null
  if (t?.toMillis) return t.toMillis()
  if (typeof t?.seconds === 'number') return t.seconds * 1000
  return 0
}

/** Their own conversations, most recently active first. */
export async function myRooms(uid: string): Promise<Room[]> {
  const rooms = (
    await getDocs(query(collection(db, 'rooms'), where('members', 'array-contains', uid)))
  ).docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
  return rooms.sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt))
}

/** A conversation's latest messages, newest first. */
export async function latestMessages(room: Room, n: number): Promise<Message[]> {
  return (
    await getDocs(
      query(collection(db, 'rooms', String(room.id), 'messages'), orderBy('ts', 'desc'), limit(n))
    )
  ).docs.map((d) => d.data() as Message)
}

/** Every announcement, for lib/miriamAppData's announcementsShown to pick theirs from. */
export async function allAnnouncements(): Promise<Announcement[]> {
  return (await getDocs(collection(db, 'announcements'))).docs.map(
    (d) => ({ ...(d.data() as Announcement), id: d.id }) as Announcement
  )
}
