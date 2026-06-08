import { create } from 'zustand'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface GroupsStore {
  groups: GroupDoc[]
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  getMemberUids: (groupIds: string[]) => string[]
}

export const useGroupsStore = create<GroupsStore>((set, get) => ({
  groups: [],
  loading: false,
  _unsub: null,
  _refCount: 0,

  subscribe: () => {
    const { _refCount, _unsub } = get()
    set({ _refCount: _refCount + 1 })
    if (_unsub) return
    set({ loading: true })
    const unsub = onSnapshot(
      collection(db, 'groups'),
      (snap) => {
        const groups: GroupDoc[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GroupDoc))
        set({ groups, loading: false })
      },
      (err) => { console.error('[groupsStore] onSnapshot error:', err); set({ loading: false }) }
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const newCount = Math.max(0, get()._refCount - 1)
    set({ _refCount: newCount })
    if (newCount === 0) {
      get()._unsub?.()
      set({ _unsub: null, groups: [] })
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
