import { create } from 'zustand'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sameId } from '@/lib/ids'
import type { UserProfile } from '@/types/user'

interface UsersStore {
  users: UserProfile[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  getUser: (uid: string | number) => UserProfile | undefined
  displayName: (uid: string | number) => string
}

export const useUsersStore = create<UsersStore>((set, get) => ({
  users: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map((d) => d.data() as UserProfile)
      set({ users, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, users: [] })
  },

  getUser: (uid) => get().users.find((u) => sameId(u.uid, uid)),

  displayName: (uid) => {
    const u = get().getUser(uid)
    return u?.displayName || u?.email || String(uid)
  },
}))
