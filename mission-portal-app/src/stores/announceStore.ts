import { create } from 'zustand'
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sameId } from '@/lib/ids'
import type { Announcement } from '@/types/events'

interface AnnounceStore {
  announcements: Announcement[]
  loading: boolean
  _unsub: (() => void) | null
  publicAnnouncements: () => Announcement[]
  myAnnouncements: (uid: string) => Announcement[]
  subscribe: () => void
  unsubscribe: () => void
  createAnnouncement: (data: Omit<Announcement, 'id'>) => Promise<void>
  deleteAnnouncement: (id: string | number) => Promise<void>
}

export const useAnnounceStore = create<AnnounceStore>((set, get) => ({
  announcements: [],
  loading: false,
  _unsub: null,

  publicAnnouncements: () =>
    get()
      .announcements.filter((a) => a.isPublic)
      .sort((a, b) => b.ts - a.ts),

  myAnnouncements: (uid) =>
    get()
      .announcements.filter(
        (a) => !a.audience || a.audience.length === 0 || a.audience.some((x) => sameId(x, uid))
      )
      .sort((a, b) => b.ts - a.ts),

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'announcements'), (snap) => {
      const announcements = snap.docs.map((d) => ({
        ...(d.data() as Announcement),
        id: d.id,
      }))
      set({ announcements, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, announcements: [] })
  },

  createAnnouncement: async (data) => {
    await addDoc(collection(db, 'announcements'), data)
  },

  deleteAnnouncement: async (id) => {
    await deleteDoc(doc(db, 'announcements', String(id)))
  },
}))
