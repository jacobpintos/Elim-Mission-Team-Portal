import { create } from 'zustand'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { youtubeThumbnail } from '@/lib/media'
import type { MusicItem, MusicDoc } from '@/types/music'

interface MusicStore {
  items: MusicItem[]
  loading: boolean

  loadItems: () => Promise<void>
  addItem: (item: Omit<MusicItem, 'id'>) => Promise<void>
  updateItem: (id: number, patch: Partial<MusicItem>) => Promise<void>
  deleteItem: (id: number) => Promise<void>
  _save: (items: MusicItem[]) => Promise<void>
}

function nextItemId(items: MusicItem[]): number {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.id)) + 1
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  items: [],
  loading: false,

  loadItems: async () => {
    set({ loading: true })
    const snap = await getDoc(doc(db, 'music', 'db'))
    const data = (snap.data() as MusicDoc | undefined) ?? { items: [] }
    set({ items: data.items, loading: false })
  },

  addItem: async (item) => {
    const { items } = get()
    const id = nextItemId(items)
    const thumbnail = item.youtubeUrl ? (youtubeThumbnail(item.youtubeUrl) ?? undefined) : undefined
    const newUntil =
      item.isNew && (item.newDays ?? 0) > 0
        ? new Date(Date.now() + (item.newDays ?? 30) * 86400000).toISOString()
        : undefined
    const newItem: MusicItem = { ...item, id, thumbnail, newUntil }
    const updated = [...items, newItem]
    set({ items: updated })
    await get()._save(updated)
  },

  updateItem: async (id, patch) => {
    const updated = get().items.map((item) => {
      if (item.id !== id) return item
      const merged = { ...item, ...patch }
      if (patch.youtubeUrl !== undefined) {
        merged.thumbnail = youtubeThumbnail(merged.youtubeUrl) ?? undefined
      }
      if ((patch.isNew !== undefined || patch.newDays !== undefined) && merged.isNew) {
        merged.newUntil = new Date(Date.now() + (merged.newDays ?? 30) * 86400000).toISOString()
      }
      return merged
    })
    set({ items: updated })
    await get()._save(updated)
  },

  deleteItem: async (id) => {
    const updated = get().items.filter((i) => i.id !== id)
    set({ items: updated })
    await get()._save(updated)
  },

  _save: async (items) => {
    await setDoc(doc(db, 'music', 'db'), { items })
  },
}))
