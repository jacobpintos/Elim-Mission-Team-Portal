import { create } from 'zustand'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { sameId } from '@/lib/ids'
import type { UserProfile } from '@/types/user'

const MEMBER_ROLES = ['admin', 'security', 'regular', 'intern', 'merch', 'worship']

interface UsersStore {
  users: UserProfile[]
  loading: boolean
  _unsub: (() => void) | null
  _authUnsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  getUser: (uid: string | number) => UserProfile | undefined
  displayName: (uid: string | number) => string
}

function startFirestoreListener(set: (s: Partial<UsersStore>) => void, get: () => UsersStore) {
  if (get()._unsub) return
  set({ loading: true })
  const unsub = onSnapshot(
    query(collection(db, 'users'), where('roles', 'array-contains-any', MEMBER_ROLES)),
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
  _refCount: 0,

  subscribe: () => {
    const { _refCount, _authUnsub } = get()
    set({ _refCount: _refCount + 1 })
    if (_authUnsub) return

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
    const newCount = Math.max(0, get()._refCount - 1)
    set({ _refCount: newCount })
    if (newCount === 0) {
      get()._unsub?.()
      get()._authUnsub?.()
      set({ _unsub: null, _authUnsub: null, users: [] })
    }
  },

  getUser: (uid) => get().users.find((u) => sameId(u.uid, uid)),

  displayName: (uid) => {
    const u = get().getUser(uid)
    return u?.displayName || u?.email || String(uid)
  },
}))
