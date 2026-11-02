import { create } from 'zustand'
import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDocs, onSnapshot } from '@/lib/liveFirestore'
import { blockOf, type Block } from '../../functions/src/blockedDates'

/**
 * The days someone has blocked off (functions/src/blockedDates): theirs
 * alone to see, and every admin's (firestore.rules blockedDates). Adding one
 * is all the app does — the server answers "Not available" on their events
 * in those days, and on any put there later (functions/src/blockedDatesSync);
 * removing one takes those answers back.
 */
interface BlockedDatesStore {
  blocks: Block[]
  loaded: boolean
  _uid: string | null
  _unsub: (() => void) | null
  _refCount: number
  subscribe: (uid: string) => void
  unsubscribe: () => void
  /** Days blocked off; the new block's id. */
  add: (uid: string, from: string, to: string, reason: string) => Promise<string>
  remove: (id: string) => Promise<void>
}

const byDate = (blocks: Block[]) =>
  [...blocks].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))

export const useBlockedDatesStore = create<BlockedDatesStore>((set, get) => ({
  blocks: [],
  loaded: false,
  _uid: null,
  _unsub: null,
  _refCount: 0,

  subscribe: (uid) => {
    set({ _refCount: get()._refCount + 1 })
    if (get()._uid === uid && get()._unsub) return
    get()._unsub?.()
    const unsub = onSnapshot(
      query(collection(db, 'blockedDates'), where('uid', '==', uid)),
      (snap) => {
        const blocks = snap.docs.flatMap((d) => blockOf(d.id, d.data()) ?? [])
        set({ blocks: byDate(blocks), loaded: true })
      },
      (err) => {
        console.error('[BlockedDatesStore] onSnapshot error:', err.code, err.message)
        set({ loaded: true })
      }
    )
    set({ _uid: uid, _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, _uid: null, blocks: [], loaded: false })
    }
  },

  // On the calendar at once, and written behind: with no signal, it waits
  // on the phone and goes when there is one.
  add: async (uid, from, to, reason) => {
    const ref = doc(collection(db, 'blockedDates'))
    const saved = setDoc(ref, {
      uid,
      from,
      to,
      reason: reason.trim().slice(0, 120),
      at: serverTimestamp(),
    })
    await Promise.race([saved, new Promise((done) => setTimeout(done, 4000))])
    saved.catch(() => {})
    return ref.id
  },

  remove: async (id) => {
    set({ blocks: get().blocks.filter((b) => b.id !== id) })
    await deleteDoc(doc(db, 'blockedDates', id))
  },
}))

/** Someone's blocks, read once: for Miriam, wherever she is asked. */
export async function readBlocks(uid: string): Promise<Block[]> {
  const snap = await getDocs(query(collection(db, 'blockedDates'), where('uid', '==', uid)))
  return byDate(snap.docs.flatMap((d) => blockOf(d.id, d.data()) ?? []))
}
