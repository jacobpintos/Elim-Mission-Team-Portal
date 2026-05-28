import { create } from 'zustand'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { InAppNotif } from '@/types/events'

interface NotifsStore {
  items: InAppNotif[]
  unreadCount: number
  loading: boolean
  _unsub: (() => void) | null
  subscribe: (uid: string) => void
  unsubscribe: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  _uid: string | null
}

export const useNotifsStore = create<NotifsStore>((set, get) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  _unsub: null,
  _uid: null,

  subscribe: (uid) => {
    if (get()._unsub) return
    set({ loading: true, _uid: uid })
    const unsub = onSnapshot(doc(db, 'notifs', uid), (snap) => {
      const data = snap.data() as { items?: InAppNotif[] } | undefined
      const items = data?.items ?? []
      set({
        items,
        unreadCount: items.filter((i) => !i.read).length,
        loading: false,
      })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, items: [], unreadCount: 0, _uid: null })
  },

  markRead: async (id) => {
    const { _uid, items } = get()
    if (!_uid) return
    const updated = items.map((i) => (i.id === id ? { ...i, read: true } : i))
    set({ items: updated, unreadCount: updated.filter((i) => !i.read).length })
    await updateDoc(doc(db, 'notifs', _uid), {
      items: updated,
    })
  },

  markAllRead: async () => {
    const { _uid, items } = get()
    if (!_uid) return
    const updated = items.map((i) => ({ ...i, read: true }))
    set({ items: updated, unreadCount: 0 })
    await updateDoc(doc(db, 'notifs', _uid), { items: updated })
  },
}))
