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

/**
 * How long to wait before re-attaching after a listener fails.
 *
 * A listener that attaches while auth is still settling is refused, and the
 * count then reads zero — an unattended queue looking like an empty one. Long
 * enough that a genuine outage is not hammered, short enough that the badge
 * appears while the tab is still open.
 */
const RETRY_DELAY_MS = 2000

interface ModerationStore {
  openReports: number
  flaggedRooms: number
  loading: boolean
  _unsubReports: (() => void) | null
  _unsubRooms: (() => void) | null
  _retry: ReturnType<typeof setTimeout> | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  queueCount: () => number
  /** Internal: open both listeners. Exposed only so the retry can call it. */
  _attach: () => void
}

export const useModerationStore = create<ModerationStore>((set, get) => ({
  openReports: 0,
  flaggedRooms: 0,
  loading: false,
  _unsubReports: null,
  _unsubRooms: null,
  _retry: null,
  _refCount: 0,

  queueCount: () => get().openReports + get().flaggedRooms,

  _attach: () => {
    set({ loading: true })

    /**
     * Give up on both listeners and try again, provided anyone is still
     * watching.
     *
     * Recovery used to work by zeroing the reference count so the next
     * subscribe() would reattach — but a screen already on the tab never calls
     * subscribe() again, so the badge stayed blank until you navigated
     * somewhere that mounted the bar afresh. Retrying on a timer fixes it
     * where the failure happened.
     */
    const failed = (what: string, err: { code?: string; message?: string }) => {
      console.warn(`[ModerationStore] ${what} listener failed`, err.code, err.message)
      get()._unsubReports?.()
      get()._unsubRooms?.()
      set({ loading: false, _unsubReports: null, _unsubRooms: null })
      if (get()._refCount > 0 && !get()._retry) {
        const timer = setTimeout(() => {
          set({ _retry: null })
          if (get()._refCount > 0) get()._attach()
        }, RETRY_DELAY_MS)
        set({ _retry: timer })
      }
    }

    const unsubReports = onSnapshot(
      query(collection(db, 'contentReports'), where('status', '==', 'open')),
      (snap) => set({ openReports: snap.size, loading: false }),
      (err) => failed('reports', err)
    )

    // "Has anyone flagged this room" cannot be asked as "is the array
    // non-empty", so it is asked as "is it something other than empty".
    // Firestore's != also drops documents where the field is absent, which is
    // every room nobody has ever flagged — exactly what should be left out.
    const unsubRooms = onSnapshot(
      query(collection(db, 'rooms'), where('reviewers', '!=', [])),
      (snap) => set({ flaggedRooms: snap.size }),
      (err) => failed('rooms', err)
    )

    set({ _unsubReports: unsubReports, _unsubRooms: unsubRooms })
  },

  subscribe: () => {
    // Reference counted: the tab bar mounts on all three Inbox screens, so
    // moving between them subscribes again before the screen being left has
    // unsubscribed. Without counting, that departure would close the listener
    // for the screen just opened.
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    get()._attach()
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count > 0) return
    const retry = get()._retry
    if (retry) clearTimeout(retry)
    get()._unsubReports?.()
    get()._unsubRooms?.()
    // Counts are reset: a stale badge claiming work is waiting, on a screen
    // no longer listening for it to be cleared, is worse than no badge.
    set({
      _unsubReports: null,
      _unsubRooms: null,
      _retry: null,
      openReports: 0,
      flaggedRooms: 0,
    })
  },
}))
