import { create } from 'zustand'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConfigMain, PostsConfig, CommonTeam } from '@/types/events'

interface ConfigStore {
  calY: number
  calM: number
  commonTeams: CommonTeam[]
  postsConfig: PostsConfig
  lastSeenPosts: Record<string, number>
  ccliLicense: string
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  setCalMonth: (y: number, m: number) => void
  setCcliLicense: (license: string) => Promise<void>
  markPageSeen: (uid: string, pageId: string) => Promise<void>
}

const now = new Date()

export const useConfigStore = create<ConfigStore>((set, get) => ({
  calY: now.getFullYear(),
  calM: now.getMonth() + 1,
  commonTeams: [] as CommonTeam[],
  postsConfig: { pages: [] },
  lastSeenPosts: {},
  ccliLicense: '',
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data() as ConfigMain | undefined
      if (!data) {
        set({ loading: false })
        return
      }
      set({
        calY: data.calY ?? now.getFullYear(),
        calM: data.calM ?? now.getMonth() + 1,
        commonTeams: (data.COMMON_TEAMS ?? []).map((t) =>
          typeof t === 'string' ? { name: t, members: [] } : t
        ),
        postsConfig: data.postsConfig ?? { pages: [] },
        lastSeenPosts: data.lastSeenPosts ?? {},
        ccliLicense: data.ccliLicense ?? '',
        loading: false,
      })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },

  setCalMonth: (y, m) => {
    set({ calY: y, calM: m })
    updateDoc(doc(db, 'config', 'main'), {
      calY: y,
      calM: m,
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  },

  setCcliLicense: async (license) => {
    set({ ccliLicense: license })
    await updateDoc(doc(db, 'config', 'main'), {
      ccliLicense: license,
      updatedAt: serverTimestamp(),
    })
  },

  markPageSeen: async (uid, pageId) => {
    const ts = Date.now()
    const key = `${uid}_${pageId}`
    set((s) => ({ lastSeenPosts: { ...s.lastSeenPosts, [key]: ts } }))
    await updateDoc(doc(db, 'config', 'main'), {
      [`lastSeenPosts.${key}`]: ts,
    })
  },
}))
