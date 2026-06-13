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
import type { ChordSheet, ChordSheetSection } from '@/types/chordSheet'

// Firestore does not support nested arrays.
// chordTokens (string[][]) is serialized as string[] on write
// (each row JSON-encoded) and deserialized on read.

function serializeSection(s: ChordSheetSection): object {
  const result: Record<string, unknown> = {
    ...s,
    chordTokens: s.chordTokens.map((row) => JSON.stringify(row)),
  }
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined))
}

function deserializeSection(raw: Record<string, unknown>): ChordSheetSection {
  const tokens = raw.chordTokens
  return {
    ...(raw as unknown as ChordSheetSection),
    chordTokens: Array.isArray(tokens)
      ? tokens.map((row: unknown) => {
          if (typeof row === 'string') {
            try { return JSON.parse(row) as string[] } catch { return [] }
          }
          return Array.isArray(row) ? (row as string[]) : []
        })
      : [],
  }
}

interface ChordSheetsStore {
  chordSheets: ChordSheet[]
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  createChordSheet: (
    data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<string | number>
  updateChordSheet: (
    id: string | number,
    data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>
  deleteChordSheet: (id: string | number) => Promise<void>
}

export const useChordSheetsStore = create<ChordSheetsStore>((set, get) => ({
  chordSheets: [],
  loading: false,
  _unsub: null,
  _refCount: 0,

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    const unsub = onSnapshot(
      collection(db, 'chordSheets'),
      (snap) => {
        const chordSheets = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>
          return {
            ...raw,
            id: d.id,
            sections: Array.isArray(raw.sections)
              ? (raw.sections as Record<string, unknown>[]).map(deserializeSection)
              : [],
          } as ChordSheet
        })
        set({ chordSheets, loading: false })
      },
      (err) => {
        console.error('[ChordSheetsStore] onSnapshot error:', err.code, err.message)
        // Clear _unsub so subscribe() can be retried (e.g. after auth is ready)
        set({ loading: false, _unsub: null })
      },
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, chordSheets: [] })
    }
  },

  createChordSheet: async (data) => {
    const id = await nextId('nChordSheet')
    const payload = Object.fromEntries(
      Object.entries({
        ...data,
        id,
        sections: data.sections.map(serializeSection),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).filter(([, v]) => v !== undefined),
    )
    await setDoc(doc(db, 'chordSheets', String(id)), payload)
    return id
  },

  updateChordSheet: async (id, data) => {
    const payload = Object.fromEntries(
      Object.entries({
        ...data,
        sections: data.sections.map(serializeSection),
        updatedAt: serverTimestamp(),
      }).filter(([, v]) => v !== undefined),
    )
    await updateDoc(doc(db, 'chordSheets', String(id)), payload)
  },

  deleteChordSheet: async (id) => {
    await deleteDoc(doc(db, 'chordSheets', String(id)))
  },
}))
