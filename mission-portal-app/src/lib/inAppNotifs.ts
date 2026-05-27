// Helper to write in-app notifications to Firestore
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { InAppNotif } from '@/types/events'

export async function addInAppNotif(
  uid: string,
  msg: string,
  type = 'info',
  link?: string
): Promise<void> {
  const ref = doc(db, 'notifs', uid)
  const snap = await getDoc(ref)
  const existing = (snap.data()?.items ?? []) as InAppNotif[]
  const notif: InAppNotif = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    msg,
    ts: Date.now(),
    type,
    read: false,
    link,
  }
  await setDoc(ref, { items: [...existing, notif] }, { merge: true })
}
