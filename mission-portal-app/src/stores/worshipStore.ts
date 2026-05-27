import { create } from 'zustand'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addInAppNotif } from '@/lib/inAppNotifs'
import type { Setlist, InputRow, InputListKey } from '@/types/worship'
import { INPUT_LIST_SIZES } from '@/types/worship'

function padList(rows: InputRow[], count: number): InputRow[] {
  const result = [...rows]
  while (result.length < count) result.push({ input: '', output: '' })
  return result.slice(0, count)
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null

interface WorshipStore {
  setlists: Setlist[]
  inputLists: { sunday: InputRow[]; event: InputRow[]; wh2: InputRow[] }
  loading: boolean

  loadSetlists: () => Promise<void>
  saveSetlist: (sl: Setlist, notifyUids?: string[]) => Promise<void>
  deleteSetlist: (id: number) => Promise<void>
  pruneExpired: () => Promise<void>

  loadInputLists: () => Promise<void>
  updateInputLists: (lists: WorshipStore['inputLists']) => void
  persistInputLists: () => Promise<void>
}

export const useWorshipStore = create<WorshipStore>((set, get) => ({
  setlists: [],
  inputLists: {
    sunday: padList([], INPUT_LIST_SIZES.sunday),
    event: padList([], INPUT_LIST_SIZES.event),
    wh2: padList([], INPUT_LIST_SIZES.wh2),
  },
  loading: false,

  loadSetlists: async () => {
    set({ loading: true })
    const snap = await getDocs(collection(db, 'setlists'))
    const setlists: Setlist[] = snap.docs
      .map((d) => d.data() as Setlist)
      .sort((a, b) => a.date.localeCompare(b.date))
    set({ setlists, loading: false })
  },

  saveSetlist: async (sl, notifyUids = []) => {
    const existing = get().setlists.find((s) => s.id === sl.id)
    const wasPublished = existing?.published ?? false
    const isNew = !existing || sl.id === 0

    let id = sl.id
    if (isNew) id = await nextId('nSetlist')

    const toSave: Setlist = { ...sl, id, songs: sl.songs.filter((s) => s.song.trim() !== '') }
    await setDoc(doc(db, 'setlists', String(id)), toSave)

    if (isNew) {
      set((s) => ({
        setlists: [...s.setlists, toSave].sort((a, b) => a.date.localeCompare(b.date)),
      }))
    } else {
      set((s) => ({ setlists: s.setlists.map((s2) => (s2.id === id ? toSave : s2)) }))
    }

    if (sl.published && !wasPublished && notifyUids.length > 0) {
      for (const uid of notifyUids) {
        try {
          await addInAppNotif(uid, `Setlist published for ${sl.date}`, 'worship')
        } catch { /* non-fatal */ }
      }
    }
  },

  deleteSetlist: async (id) => {
    await deleteDoc(doc(db, 'setlists', String(id)))
    set((s) => ({ setlists: s.setlists.filter((sl) => sl.id !== id) }))
  },

  pruneExpired: async () => {
    const today = new Date().toISOString().split('T')[0]
    const snap = await getDocs(query(collection(db, 'setlists'), where('date', '<', today)))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
    set((s) => ({ setlists: s.setlists.filter((sl) => sl.date >= today) }))
  },

  loadInputLists: async () => {
    const snap = await getDoc(doc(db, 'config', 'inputLists'))
    if (!snap.exists()) return
    const data = snap.data() as { lists?: { sunday?: InputRow[]; event?: InputRow[]; wh2?: InputRow[] } }
    const lists = data.lists ?? {}
    set({
      inputLists: {
        sunday: padList(lists.sunday ?? [], INPUT_LIST_SIZES.sunday),
        event: padList(lists.event ?? [], INPUT_LIST_SIZES.event),
        wh2: padList(lists.wh2 ?? [], INPUT_LIST_SIZES.wh2),
      },
    })
  },

  updateInputLists: (lists) => {
    set({ inputLists: lists })
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(() => {
      get().persistInputLists().catch(() => {})
    }, 500)
  },

  persistInputLists: async () => {
    const { inputLists } = get()
    const lists: Record<InputListKey, InputRow[]> = {
      sunday: padList(inputLists.sunday, INPUT_LIST_SIZES.sunday),
      event: padList(inputLists.event, INPUT_LIST_SIZES.event),
      wh2: padList(inputLists.wh2, INPUT_LIST_SIZES.wh2),
    }
    await setDoc(doc(db, 'config', 'inputLists'), { lists }, { merge: true })
  },
}))
