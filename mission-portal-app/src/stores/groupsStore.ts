import { create } from 'zustand'
import { collection, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'

export interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface GroupsStore {
  groups: GroupDoc[]
  loading: boolean
  _unsub: (() => void) | null
  _authUnsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  getMemberUids: (groupIds: string[]) => string[]
}

function startFirestoreListener(set: (s: Partial<GroupsStore>) => void, get: () => GroupsStore) {
  if (get()._unsub) return
  set({ loading: true })
  const unsub = onSnapshot(
    collection(db, 'groups'),
    (snap) => {
      const groups: GroupDoc[] = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          name: data.name ?? '',
          members: Array.isArray(data.members) ? data.members.map(String) : [],
        }
      })
      set({ groups, loading: false })
    },
    (err) => {
      console.error('[groupsStore] onSnapshot error:', err)
      set({ loading: false, _unsub: null })
    }
  )
  set({ _unsub: unsub })
}

export const useGroupsStore = create<GroupsStore>((set, get) => ({
  groups: [],
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
        set({ _unsub: null, groups: [], loading: false })
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
      set({ _unsub: null, _authUnsub: null, groups: [] })
    }
  },

  getMemberUids: (groupIds: string[]) => {
    const { groups } = get()
    const uids = new Set<string>()
    groupIds.forEach((gid) => {
      const group = groups.find((g) => g.id === gid)
      group?.members.forEach((uid) => uids.add(uid))
    })
    return Array.from(uids)
  },
}))
