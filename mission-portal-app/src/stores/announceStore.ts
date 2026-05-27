import { create } from 'zustand'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addInAppNotif } from '@/lib/inAppNotifs'
import { addAuditEntry } from '@/lib/audit'
import type { Announcement } from '@/types/announcements'
import type { Attachment } from '@/types/shared'

interface AnnounceStore {
  announcements: Announcement[]
  loading: boolean
  _unsub: (() => void) | null

  subscribe: () => void
  unsubscribe: () => void
  loadAnnouncements: () => Promise<void>

  createAnnouncement: (
    data: { title: string; body: string; isPublic: boolean; audience: string[]; attachment?: Attachment | null },
    byUid: string,
    allUserUids: string[]
  ) => Promise<void>
  deleteAnnouncement: (id: number) => Promise<void>

  myAnnouncements: (uid: string) => Announcement[]
  publicAnnouncements: () => Announcement[]
}

export const useAnnounceStore = create<AnnounceStore>((set, get) => ({
  announcements: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'announcements'), (snap) => {
      const announcements: Announcement[] = snap.docs
        .map((d) => ({ ...(d.data() as Announcement), id: Number(d.id) }))
        .sort((a, b) => b.ts - a.ts)
      set({ announcements, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, announcements: [] })
  },

  loadAnnouncements: async () => {
    // Subscription handles loading; this is a no-op when subscribed
  },

  createAnnouncement: async (data, byUid, allUserUids) => {
    const id = await nextId('nNotif')
    const announcement: Announcement = {
      id, title: data.title, body: data.body,
      isPublic: data.isPublic, audience: data.audience,
      attachment: data.attachment ?? null, by: byUid, ts: Date.now(),
    }
    await setDoc(doc(db, 'announcements', String(id)), announcement)

    const recipients = data.audience.length > 0 ? data.audience : allUserUids
    for (const uid of recipients) {
      try { await addInAppNotif(uid, `New announcement: ${data.title}`, 'announce') }
      catch { /* non-fatal */ }
    }
    await addAuditEntry(byUid, 'Create Announcement', data.title)
  },

  deleteAnnouncement: async (id) => {
    await deleteDoc(doc(db, 'announcements', String(id)))
    set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) }))
  },

  myAnnouncements: (uid) =>
    get().announcements
      .filter((a) => !a.audience || a.audience.length === 0 || a.audience.includes(uid))
      .sort((a, b) => b.ts - a.ts),

  publicAnnouncements: () =>
    get().announcements.filter((a) => a.isPublic).sort((a, b) => b.ts - a.ts),
}))
