import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import type { SetList } from '@/types/worship'

interface WorshipStore {
  setLists: SetList[]
  loading: boolean
  _unsub: (() => void) | null
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
  _refCount: 0,

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'setLists'), (snap) => {
      const setLists = snap.docs.map((d) => ({ ...(d.data() as SetList), id: d.id }))
      set({ setLists, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, setLists: [] })
    }
  },

  createSetList: async (data) => {
    const id = await nextId('nSetList')
    await setDoc(doc(db, 'setLists', String(id)), {
      ...data,
      id,
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
