import { create } from 'zustand'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type InputListLocation = 'sunday' | 'event' | 'wh2'

export interface InputListRow {
  input: string
  output: string
}

export const INPUT_LIST_ROW_COUNTS: Record<InputListLocation, number> = {
  sunday: 44,
  event: 44,
  wh2: 32,
}

interface InputListStore {
  rows: Record<InputListLocation, InputListRow[] | null>
  loading: Record<InputListLocation, boolean>
  loadLocation: (loc: InputListLocation) => Promise<void>
  setRow: (loc: InputListLocation, idx: number, field: 'input' | 'output', value: string) => void
  saveLocation: (loc: InputListLocation) => Promise<void>
}

export const useInputListStore = create<InputListStore>((set, get) => ({
  rows: { sunday: null, event: null, wh2: null },
  loading: { sunday: false, event: false, wh2: false },

  loadLocation: async (loc) => {
    if (get().rows[loc] !== null || get().loading[loc]) return
    set((s) => ({ loading: { ...s.loading, [loc]: true } }))
    try {
      const snap = await getDoc(doc(db, 'inputList', loc))
      const saved = snap.exists() ? (snap.data().rows as InputListRow[] | undefined) : undefined
      const count = INPUT_LIST_ROW_COUNTS[loc]
      const rows = Array.from({ length: count }, (_, i) => ({
        input: saved?.[i]?.input ?? '',
        output: saved?.[i]?.output ?? '',
      }))
      set((s) => ({ rows: { ...s.rows, [loc]: rows }, loading: { ...s.loading, [loc]: false } }))
    } catch {
      set((s) => ({ loading: { ...s.loading, [loc]: false } }))
    }
  },

  setRow: (loc, idx, field, value) => {
    const current = get().rows[loc]
    if (!current) return
    const updated = [...current]
    updated[idx] = { ...updated[idx], [field]: value }
    set((s) => ({ rows: { ...s.rows, [loc]: updated } }))
  },

  saveLocation: async (loc) => {
    const rows = get().rows[loc]
    if (!rows) return
    await setDoc(doc(db, 'inputList', loc), { rows, updatedAt: serverTimestamp() })
  },
}))
