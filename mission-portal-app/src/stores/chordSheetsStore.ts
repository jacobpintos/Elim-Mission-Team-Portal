import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import type { ChordSheet } from '@/types/chordSheet'

interface ChordSheetsStore {
  chordSheets: ChordSheet[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  createChordSheet: (
    data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<string | number>
  deleteChordSheet: (id: string | number) => Promise<void>
}

export const useChordSheetsStore = create<ChordSheetsStore>((set, get) => ({
  chordSheets: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'chordSheets'), (snap) => {
      const chordSheets = snap.docs.map((d) => ({ ...(d.data() as ChordSheet), id: d.id }))
      set({ chordSheets, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, chordSheets: [] })
  },

  createChordSheet: async (data) => {
    const id = await nextId('nChordSheet')
    await setDoc(doc(db, 'chordSheets', String(id)), {
      ...data,
      id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  },

  deleteChordSheet: async (id) => {
    await deleteDoc(doc(db, 'chordSheets', String(id)))
  },
}))
