import { create } from 'zustand'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { defaults } from '@/theme/defaults'
import { autoTextColor } from '@/theme/contrast'
import type { ThemeDoc } from '@/types/theme'

type Mode = 'dark' | 'light'

interface ThemeStore {
  theme: ThemeDoc
  mode: Mode
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  setMode: (mode: Mode) => void
  publishTheme: (patch: Partial<ThemeDoc>, uid: string) => Promise<void>
  onPrimary: () => string
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: defaults,
  mode: 'dark',
  loading: true,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    const unsub = onSnapshot(doc(db, 'appSettings', 'theme'), (snap) => {
      const data = (snap.data() as ThemeDoc | undefined) ?? defaults
      set({ theme: data, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },

  setMode: (mode) => set({ mode }),

  publishTheme: async (patch, uid) => {
    await setDoc(
      doc(db, 'appSettings', 'theme'),
      { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    )
  },

  onPrimary: () => {
    const t = get().theme
    return t.onPrimaryOverride ?? autoTextColor(t.primary)
  },
}))
