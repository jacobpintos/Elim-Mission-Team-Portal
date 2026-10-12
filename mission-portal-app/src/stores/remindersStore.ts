import { create } from 'zustand'
import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'

/**
 * Reminders people set for themselves through Miriam ("remind me to go to
 * Costco at 5 pm tomorrow"): theirs alone (firestore.rules), shown in the
 * Tasks tab, and sent as a push at their time (functions: sendDueReminders).
 */
export interface Reminder {
  id: string
  uid: string
  text: string
  /** When, in ms. */
  remindAt: number
  done: boolean
  /** Not sent yet: what sendDueReminders looks for. */
  pending: boolean
}

/** How long to wait for the database to have it, before taking it as saved for when there is a signal. */
const SAVE_WAIT_MS = 4000

interface RemindersStore {
  reminders: Reminder[]
  loaded: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: (uid: string) => void
  unsubscribe: () => void
  add: (uid: string, text: string, at: Date) => Promise<string>
  setDone: (r: Reminder, done: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useRemindersStore = create<RemindersStore>((set, get) => ({
  reminders: [],
  loaded: false,
  _unsub: null,
  _refCount: 0,

  subscribe: (uid) => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    const unsub = onSnapshot(
      query(collection(db, 'reminders'), where('uid', '==', uid)),
      (snap) => {
        const reminders = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Reminder, 'id'>), id: d.id }))
          .sort((a, b) => a.remindAt - b.remindAt)
        set({ reminders, loaded: true })
      },
      () => set({ loaded: true })
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, reminders: [], loaded: false })
    }
  },

  add: async (uid, text, at) => {
    // Its id made here, so it is set even without a signal: saved on the
    // phone at once, and sent as soon as there is one.
    const ref = doc(collection(db, 'reminders'))
    const saved = setDoc(ref, {
      uid,
      text: text.slice(0, 300),
      remindAt: at.getTime(),
      done: false,
      pending: true,
      createdAt: serverTimestamp(),
    })
    await Promise.race([saved, new Promise((done) => setTimeout(done, SAVE_WAIT_MS))])
    saved.catch(() => {})
    return ref.id
  },

  setDone: async (r, done) => {
    set((s) => ({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, done } : x)) }))
    // Undone before its time: sent after all.
    await updateDoc(doc(db, 'reminders', r.id), {
      done,
      ...(done ? {} : { pending: r.remindAt > Date.now() }),
    })
  },

  remove: async (id) => {
    set((s) => ({ reminders: s.reminders.filter((x) => x.id !== id) }))
    await deleteDoc(doc(db, 'reminders', id))
  },
}))
