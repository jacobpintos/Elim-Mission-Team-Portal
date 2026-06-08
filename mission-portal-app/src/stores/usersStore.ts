import { create } from 'zustand'
import { collection, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { sameId } from '@/lib/ids'
import type { UserProfile } from '@/types/user'

interface UsersStore {
  users: UserProfile[]
  loading: boolean
  _unsub: (() => void) | null
  _authUnsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  getUser: (uid: string | number) => UserProfile | undefined
  displayName: (uid: string | number) => string
}

function startFirestoreListener(set: (s: Partial<UsersStore>) => void, get: () => UsersStore) {
  if (get()._unsub) return
  set({ loading: true })
  const unsub = onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const users = snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
      set({ users, loading: false })
    },
    (err) => {
      console.error('[usersStore] onSnapshot error:', err)
      set({ loading: false, _unsub: null })
    }
  )
  set({ _unsub: unsub })
}

export const useUsersStore = create<UsersStore>((set, get) => ({
  users: [],
  loading: false,
  _unsub: null,
  _authUnsub: null,

  subscribe: () => {
    if (get()._authUnsub) return

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        startFirestoreListener(set, get)
      } else {
        get()._unsub?.()
        set({ _unsub: null, users: [], loading: false })
      }
    })
    set({ _authUnsub: authUnsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    get()._authUnsub?.()
    set({ _unsub: null, _authUnsub: null, users: [] })
  },

  getUser: (uid) => get().users.find((u) => sameId(u.uid, uid)),

  displayName: (uid) => {
    const u = get().getUser(uid)
    return u?.displayName || u?.email || String(uid)
  },
}))
