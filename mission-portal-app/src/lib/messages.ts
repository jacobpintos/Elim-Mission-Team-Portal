import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Message } from '@/types/events'

export const MESSAGES_PAGE_SIZE = 50

export async function loadMessages(roomId: string | number, beforeTs?: number): Promise<Message[]> {
  const ref = collection(db, 'rooms', String(roomId), 'messages')
  const q = beforeTs
    ? query(ref, orderBy('ts', 'desc'), startAfter(beforeTs), limit(MESSAGES_PAGE_SIZE))
    : query(ref, orderBy('ts', 'desc'), limit(MESSAGES_PAGE_SIZE))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as Message).reverse()
}

export async function sendMessageToRoom(
  roomId: string | number,
  uid: string | number,
  text: string,
  attachment: Message['attachment'] = null
): Promise<void> {
  const ts = Date.now()
  const msgId = `${ts}_${uid}`
  const ref = doc(db, 'rooms', String(roomId), 'messages', msgId)
  const { setDoc } = await import('firebase/firestore')
  await setDoc(ref, {
    uid,
    text,
    attachment,
    ts,
    readBy: { [String(uid)]: true },
  } satisfies Message)
}

export async function markMessageRead(
  roomId: string | number,
  msgTs: number,
  uid: string
): Promise<void> {
  // Find message doc by ts prefix — doc ID is `${ts}_${uid}`
  const ref = collection(db, 'rooms', String(roomId), 'messages')
  const q = query(ref, orderBy('ts', 'desc'), limit(50))
  const snap = await getDocs(q)
  const toUpdate = snap.docs.filter((d) => (d.data() as Message).ts === msgTs)
  await Promise.all(toUpdate.map((d) => updateDoc(d.ref, { [`readBy.${uid}`]: true })))
}
