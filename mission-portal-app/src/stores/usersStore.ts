import { create } from 'zustand'
import { collection, getDocs, query, where } from 'firebase/firestore'
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

async function loadUsers(set: (s: Partial<UsersStore>) => void) {
  set({ loading: true })
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('roles', 'array-contains-any', MEMBER_ROLES))
    )
    const users = snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
    set({ users, loading: false })
  } catch (err) {
    console.error('[usersStore] getDocs error:', err)
    set({ loading: false })
  }
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
        loadUsers(set)
      } else {
        set({ users: [], loading: false })
      }
    })
    set({ _authUnsub: authUnsub })
  },

  unsubscribe: () => {
    const newCount = Math.max(0, get()._refCount - 1)
    set({ _refCount: newCount })
    if (newCount === 0) {
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
