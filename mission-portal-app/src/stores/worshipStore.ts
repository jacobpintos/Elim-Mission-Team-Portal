import { create } from 'zustand'
import { collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { onSnapshot, getDocs } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { isGuest, isWorship } from '@/lib/roles'
import { seers } from '@/lib/seenBy'
import { useAuthStore } from '@/stores/authStore'
import type { SetList } from '@/types/worship'

type Profile = ReturnType<typeof useAuthStore.getState>['profile']

/** Whether this person reads set lists at all: the worship team, guests and admins. */
const readsSetLists = (profile: Profile): profile is NonNullable<Profile> =>
  !!profile?.uid && (isWorship(profile) || isGuest(profile))

/**
 * Those of the events they may see, and those for no event
 * (functions/src/recordAccess setListSeenBy).
 */
function seenBy(profile: NonNullable<Profile>) {
  const mine = seers(profile)
  return (sl: SetList) => !sl.seenBy || sl.seenBy.some((x) => mine.includes(x))
}

/** Whether the person signed in may read this set list. */
export function seesSetList(sl: SetList): boolean {
  const profile = useAuthStore.getState().profile
  return readsSetLists(profile) && seenBy(profile)(sl)
}

/** The set lists this person may read, read once; none for anyone who reads none. */
export async function readSetLists(): Promise<SetList[]> {
  const profile = useAuthStore.getState().profile
  if (!readsSetLists(profile)) return []
  const snap = await getDocs(collection(db, 'setLists'))
  return snap.docs.map((d) => ({ ...(d.data() as SetList), id: d.id })).filter(seenBy(profile))
}

interface WorshipStore {
  setLists: SetList[]
  loading: boolean
  _unsub: (() => void) | null
  _unsubAuth: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  createSetList: (data: Omit<SetList, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | number>
  updateSetList: (id: string | number, patch: Partial<SetList>) => Promise<void>
  deleteSetList: (id: string | number) => Promise<void>
}

export const useWorshipStore = create<WorshipStore>((set, get) => ({
  setLists: [],
  loading: false,
  _unsub: null,
  _unsubAuth: null,
  _refCount: 0,

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    // For the worship team, guests and admins: those of the events they may
    // see, and those for no event (functions/src/recordAccess setListSeenBy).
    // Listened to as whoever is signed in, and again if that, or their
    // roles, change.
    let listeningAs: string | null = null
    const listen = () => {
      const profile = useAuthStore.getState().profile
      const reads = readsSetLists(profile)
      const as = reads ? seers(profile).join('|') : ''
      if (as === listeningAs) return
      listeningAs = as
      get()._unsub?.()
      set({ _unsub: null, setLists: [] })
      if (!reads) return set({ loading: false })
      const mine = seenBy(profile)
      const unsub = onSnapshot(collection(db, 'setLists'), (snap) => {
        const setLists = snap.docs.map((d) => ({ ...(d.data() as SetList), id: d.id })).filter(mine)
        set({ setLists, loading: false })
      })
      set({ _unsub: unsub })
    }
    listen()
    set({ _unsubAuth: useAuthStore.subscribe(listen) })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      get()._unsubAuth?.()
      set({ _unsub: null, _unsubAuth: null, setLists: [] })
    }
  },

  createSetList: async (data) => {
    const id = await nextId('nSetList')
    await setDoc(doc(db, 'setLists', String(id)), {
      ...data,
      id,
      // Its maker, to begin with: the server adds whoever may see its event
      // (functions/src/recordAccessSync stampSetListRecord).
      seenBy: [String(useAuthStore.getState().profile?.uid ?? '')],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  },

  updateSetList: async (id, patch) => {
    await updateDoc(doc(db, 'setLists', String(id)), {
      ...patch,
      updatedAt: serverTimestamp(),
    })
  },

  deleteSetList: async (id) => {
    await deleteDoc(doc(db, 'setLists', String(id)))
  },
}))
