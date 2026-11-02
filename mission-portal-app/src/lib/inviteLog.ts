import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'

export type InviteChannel = 'text' | 'facebook' | 'email'

/**
 * An invitation sent — Invite a friend, from Connect, an event's page or its
 * card — kept for the admins' briefing ("3 people invited someone to the next
 * Sunday service"): who, to which event's date, and how. Only ever counted;
 * the message itself, and who it went to, never leave the phone.
 *
 * Counted when they choose how to send it: whether they then sent it, the app
 * can't see.
 */
export function logInvite(eventKey: string, date: string, channel: InviteChannel): void {
  const uid = useAuthStore.getState().profile?.uid
  if (!uid || !eventKey) return
  addDoc(collection(db, 'invites'), {
    uid: String(uid),
    eventKey,
    date,
    channel,
    at: serverTimestamp(),
  }).catch(() => {})
}
