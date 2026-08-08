import { create } from 'zustand'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * How much is waiting in the moderation queue.
 *
 * Counts only — the Moderation screen loads the reports and rooms themselves.
 * This exists so the Inbox tab bar can say there is something to look at
 * without every admin screen loading the whole moderation surface to find out.
 *
 * Two things land in that queue, by two different routes:
 *
 * - a report someone filed about a single message, still open
 * - a whole conversation an admin flagged for review from the chat header
 *
 * Both are admin-only reads. Nothing here subscribes for anyone else, and the
 * rules would refuse it if it tried.
 */
interface ModerationStore {
  openReports: number
  flaggedRooms: number
  loading: boolean
  _unsubReports: (() => void) | null
  _unsubRooms: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  queueCount: () => number
}

export const useModerationStore = create<ModerationStore>((set, get) => ({
  openReports: 0,
  flaggedRooms: 0,
  loading: false,
  _unsubReports: null,
  _unsubRooms: null,
  _refCount: 0,

  queueCount: () => get().openReports + get().flaggedRooms,

  subscribe: () => {
    // Reference counted: the tab bar mounts on all three Inbox screens, so
    // moving between them subscribes again before the screen being left has
    // unsubscribed. Without counting, that departure would close the listener
    // for the screen just opened.
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })

    const unsubReports = onSnapshot(
      query(collection(db, 'contentReports'), where('status', '==', 'open')),
      (snap) => set({ openReports: snap.size, loading: false }),
      (err) => {
        console.warn('[ModerationStore] reports listener failed', err.code, err.message)
        set({ openReports: 0, loading: false, _unsubReports: null, _refCount: 0 })
      }
    )

    // "Has anyone flagged this room" cannot be asked as "is the array
    // non-empty", so it is asked as "is it something other than empty".
    // Firestore's != also drops documents where the field is absent, which is
    // every room nobody has ever flagged — exactly what should be left out.
    const unsubRooms = onSnapshot(
      query(collection(db, 'rooms'), where('reviewers', '!=', [])),
      (snap) => set({ flaggedRooms: snap.size }),
      (err) => {
        console.warn('[ModerationStore] rooms listener failed', err.code, err.message)
        set({ flaggedRooms: 0, _unsubRooms: null, _refCount: 0 })
      }
    )

    set({ _unsubReports: unsubReports, _unsubRooms: unsubRooms })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count > 0) return
    get()._unsubReports?.()
    get()._unsubRooms?.()
    // Counts are reset: a stale badge claiming work is waiting, on a screen
    // no longer listening for it to be cleared, is worse than no badge.
    set({ _unsubReports: null, _unsubRooms: null, openReports: 0, flaggedRooms: 0 })
  },
}))
