import { create } from 'zustand'
import { deleteField, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc, onSnapshot } from '@/lib/liveFirestore'
import { occasionFrom, type Occasion } from '@/lib/occasions'

/**
 * Birthdays and anniversaries on the event calendar (lib/occasions): read by
 * every account but a guest's or a public one, kept by admins
 * (firestore.rules: occasions).
 *
 * One document (occasions/all), each a field by its id, as the calendar
 * notes are kept (stores/dateNotesStore): one listener, one offline copy.
 */

const REF = () => doc(db, 'occasions', 'all')

interface OccasionsStore {
  occasions: Occasion[]
  loaded: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  /** What there is, read once where nothing is listening (Miriam, the briefing). */
  read: () => Promise<Occasion[]>
  /** Added, or changed when its id is there already. */
  save: (o: Occasion) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const newOccasionId = () =>
  `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function fromDoc(data: Record<string, unknown>): Occasion[] {
  return Object.entries(data)
    .map(([id, v]) => occasionFrom(id, v))
    .filter((o): o is Occasion => !!o)
    .sort((a, b) => a.month - b.month || a.day - b.day)
}

const stored = (o: Occasion) => ({
  kind: o.kind,
  people: o.people.map((p) => ({ name: p.name.trim(), ...(p.uid ? { uid: p.uid } : {}) })),
  month: o.month,
  day: o.day,
})

export const useOccasionsStore = create<OccasionsStore>((set, get) => ({
  occasions: [],
  loaded: false,
  _unsub: null,
  _refCount: 0,

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (get()._unsub) return
    const unsub = onSnapshot(
      REF(),
      (snap) => {
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>
        set({ occasions: fromDoc(data), loaded: true })
      },
      (err) => {
        console.error('[OccasionsStore] onSnapshot error:', err.code, err.message)
        set({ loaded: true })
      }
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, occasions: [], loaded: false })
    }
  },

  read: async () => {
    if (get().loaded) return get().occasions
    const snap = await getDoc(REF())
    return fromDoc((snap.exists() ? snap.data() : {}) as Record<string, unknown>)
  },

  // Shown at once; put back as it was if the write is refused.
  save: async (o) => {
    const before = get().occasions
    const others = before.filter((x) => x.id !== o.id)
    set({ occasions: fromDoc(Object.fromEntries([...others, o].map((x) => [x.id, x]))) })
    try {
      await setDoc(REF(), { [o.id]: stored(o) }, { merge: true })
    } catch (err) {
      set({ occasions: before })
      throw err
    }
  },

  remove: async (id) => {
    const before = get().occasions
    set({ occasions: before.filter((o) => o.id !== id) })
    try {
      await setDoc(REF(), { [id]: deleteField() }, { merge: true })
    } catch (err) {
      set({ occasions: before })
      throw err
    }
  },
}))
