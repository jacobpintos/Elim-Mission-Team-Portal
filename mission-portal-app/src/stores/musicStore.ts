import { create } from 'zustand'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface MusicItem {
  id: string
  type: 'music' | 'podcast' | 'sermon'
  title: string
  youtubeUrl: string
  thumbnail?: string
  album?: string
  year?: number
  month?: number
  host?: string
  guest?: string
  preacher?: string
  featured?: boolean
  isNew?: boolean
  newDays?: number
  newUntil?: string // ISO date string YYYY-MM-DD
}

interface MusicStore {
  items: MusicItem[]
  loading: boolean
  load: () => Promise<void>
  addItem: (item: MusicItem) => Promise<void>
  updateItem: (id: string, patch: Partial<MusicItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  _save: (items: MusicItem[]) => Promise<void>
}

const REF = () => doc(db, 'music', 'db')

export const useMusicStore = create<MusicStore>((set, get) => ({
  items: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const snap = await getDoc(REF())
      const items = (snap.data()?.items as MusicItem[] | undefined) ?? []
      set({ items, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  _save: async (items: MusicItem[]) => {
    await setDoc(REF(), { items }, { merge: true })
    set({ items })
  },

  addItem: async (item) => {
    const items = [...get().items, item]
    await get()._save(items)
  },

  updateItem: async (id, patch) => {
    const items = get().items.map((it) => (it.id === id ? { ...it, ...patch } : it))
    await get()._save(items)
  },

  deleteItem: async (id) => {
    const items = get().items.filter((it) => it.id !== id)
    await get()._save(items)
  },
}))

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function youtubeThumbnail(url: string): string {
  const id = extractYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''
}
