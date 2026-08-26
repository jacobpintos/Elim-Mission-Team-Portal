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
  /** Uid of the Connections Coordinator, or '' when nobody holds it. */
  connectionsCoordinator: string
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
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
  connectionsCoordinator: '',
  loading: false,
  _unsub: null,
  _refCount: 0,

  subscribe: () => {
    // Reference counted, because several screens want this config at once and
    // the last one to mount is not the last one to unmount. With a plain
    // "already subscribed?" guard the first screen to leave tore the listener
    // down for everyone still watching, and the values it had loaded then went
    // stale with nothing to refresh them.
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    const unsub = onSnapshot(
      doc(db, 'config', 'main'),
      (snap) => {
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
          connectionsCoordinator: data.connectConfig?.connectionsCoordinator ?? '',
          loading: false,
        })
      },
      (err) => {
        console.error('[ConfigStore] onSnapshot error:', err.code, err.message)
        // Reset the count too, not just the listener. Leaving it raised would
        // make every later subscribe() see "somebody else is watching" and
        // return without reconnecting, so a single failure — attaching a
        // moment before auth is ready, say — would leave the config blank for
        // the rest of the session.
        set({ loading: false, _unsub: null, _refCount: 0 })
      }
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null })
      // The loaded values are deliberately kept. They are small, rarely
      // change, and holding them means a screen that reopens shows the right
      // thing immediately instead of flashing a default.
    }
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
