import { create } from 'zustand'
import { collection, doc, deleteDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { activeStream, type Livestream } from '@/lib/livestream'

interface LivestreamStore {
  streams: Livestream[]
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  /** The card to show right now, or null. Pass `now` so a timer can re-ask. */
  active: (now?: number) => Livestream | null
  post: (stream: Livestream) => Promise<void>
  takeDown: (id: string) => Promise<void>
}

const COL = () => collection(db, 'livestreams')

export const useLivestreamStore = create<LivestreamStore>((set, get) => ({
  streams: [],
  loading: false,
  _unsub: null,
  _refCount: 0,

  /**
   * Reference counted, like configStore: the box appears on more than one
   * screen, and the last to mount is not the last to unmount. A plain "already
   * subscribed?" guard let the first screen to leave close the listener out
   * from under the rest, which froze the box mid-service.
   *
   * A listener rather than a one-shot read, because the whole point is that the
   * box appears without anyone reloading anything.
   */
  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    const unsub = onSnapshot(
      COL(),
      (snap) => {
        const streams = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: String(data.title ?? ''),
            youtubeUrl: String(data.youtubeUrl ?? ''),
            createdAt: Number(data.createdAt ?? 0),
            expiresAt: Number(data.expiresAt ?? 0),
            createdBy: data.createdBy ? String(data.createdBy) : undefined,
          } satisfies Livestream
        })
        set({ streams, loading: false })
      },
      () => set({ loading: false })
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count > 0) return
    get()._unsub?.()
    set({ _unsub: null })
  },

  active: (now = Date.now()) => activeStream(get().streams, now),

  post: async (stream) => {
    const { id, ...rest } = stream
    await setDoc(doc(db, 'livestreams', id), { ...rest, _updatedAt: serverTimestamp() })
  },

  takeDown: async (id) => {
    await deleteDoc(doc(db, 'livestreams', id))
  },
}))
