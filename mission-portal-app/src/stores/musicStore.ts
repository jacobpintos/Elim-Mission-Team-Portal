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

/**
 * The video id inside a YouTube URL, in any of the forms a link arrives in.
 *
 * `/live/` is what YouTube puts in the address bar during a broadcast and what
 * Share offers for a stream, so it is the form an admin adding a service
 * pastes. Without it the Content form rejected every live URL as invalid.
 * `studio.youtube.com/video/...` is the other copy source, the Studio tab where
 * the broadcast is set up.
 *
 * The URL is trimmed, and the patterns stop at whitespace and at a path
 * separator. A pasted link often carries a trailing space or newline, which the
 * looser patterns captured into the id itself: that passed validation and then
 * built an embed and a thumbnail URL with a stray character on the end, so the
 * item saved fine and simply would not play.
 */
export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  const patterns = [
    /youtu\.be\/([^?&/\s]+)/,
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtube\.com\/embed\/([^?&/\s]+)/,
    /youtube\.com\/shorts\/([^?&/\s]+)/,
    /youtube\.com\/live\/([^?&/\s]+)/,
    /studio\.youtube\.com\/video\/([^?&/\s]+)/,
  ]
  for (const p of patterns) {
    const m = trimmed.match(p)
    if (m) return m[1]
  }
  return null
}

export function youtubeThumbnail(url: string): string {
  const id = extractYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''
}
