import { create } from 'zustand'
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { onSnapshot } from '@/lib/liveFirestore'
import { audit } from '@/lib/audit'
import { useUsersStore } from '@/stores/usersStore'
import { hasRules, rulesData, rulesFrom, type PersonRules } from './types'

/**
 * Custom: The Well. Special rules for people (carpoolPeople/{uid}, admins
 * only: firestore.rules), listened to while a screen that needs them is open,
 * and changed through here — a person left with none is taken off the list.
 */
interface PersonRulesStore {
  rules: PersonRules[]
  loaded: boolean
  subscribe: () => void
  unsubscribe: () => void
  save: (rules: PersonRules) => Promise<void>
  _unsub: (() => void) | null
  _listeners: number
}

const whoDid = () => {
  const uid = auth.currentUser?.uid
  return useUsersStore.getState().users.find((u) => String(u.uid) === uid)?.displayName ?? ''
}

export const usePersonRulesStore = create<PersonRulesStore>((set, get) => ({
  rules: [],
  loaded: false,
  _unsub: null,
  _listeners: 0,
  subscribe: () => {
    set((s) => ({ _listeners: s._listeners + 1 }))
    if (get()._unsub) return
    const unsub = onSnapshot(
      collection(db, 'carpoolPeople'),
      (snap) => {
        set({
          rules: snap.docs.map((d) => rulesFrom(d.id, d.data() as Record<string, unknown>)),
          loaded: true,
        })
      },
      () => set({ loaded: true })
    )
    set({ _unsub: unsub })
  },
  unsubscribe: () => {
    const left = Math.max(0, get()._listeners - 1)
    set({ _listeners: left })
    if (left > 0) return
    get()._unsub?.()
    set({ _unsub: null })
  },
  save: async (rules) => {
    const ref = doc(db, 'carpoolPeople', rules.uid)
    if (hasRules(rules)) await setDoc(ref, rulesData(rules))
    else await deleteDoc(ref)
    await audit('carpoolPeople.updated', `Updated carpool rules for ${rules.uid}`, whoDid()).catch(
      () => {}
    )
  },
}))

/** The rules, read once (for the builder's Auto-assign and Miriam): none when they can't be read. */
export async function readPersonRules(): Promise<PersonRules[]> {
  const store = usePersonRulesStore.getState()
  if (store.loaded) return store.rules
  try {
    store.subscribe()
  } catch {
    // Can't be read: planned without them, as before there were any.
    return []
  }
  try {
    for (let i = 0; i < 40 && !usePersonRulesStore.getState().loaded; i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return usePersonRulesStore.getState().rules
  } finally {
    usePersonRulesStore.getState().unsubscribe()
  }
}
