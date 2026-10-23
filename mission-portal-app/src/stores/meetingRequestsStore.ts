import { create } from 'zustand'
import {
  collection,
  deleteField,
  doc,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db, auth } from '@/lib/firebase'
import type { MeetingBlock, MeetingRequest } from '@/types/meeting'

interface MeetingRequestsStore {
  requests: MeetingRequest[]
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  byId: (id?: string) => MeetingRequest | undefined
  claim: (id: string, byUid: string, byName: string) => Promise<void>
  markHandled: (id: string, byUid: string, byName: string) => Promise<void>
  block: (request: MeetingRequest, byUid: string, byName: string) => Promise<void>
  unblock: (request: MeetingRequest) => Promise<void>
}

export const useMeetingRequestsStore = create<MeetingRequestsStore>((set, get) => ({
  requests: [],
  loading: false,
  _unsub: null,
  _refCount: 0,

  /**
   * The requests addressed to whoever is signed in.
   *
   * Filtered in the query rather than after the fact, because the rule only
   * admits a document naming the reader — and Firestore refuses a collection
   * query outright when it could return one the caller may not read, rather
   * than filtering it down. An unconstrained listen here would be denied for
   * everyone but an admin.
   */
  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return

    const uid = auth.currentUser?.uid
    if (!uid) return
    set({ loading: true })

    const unsub = onSnapshot(
      query(collection(db, 'meetingRequests'), where('leaders', 'array-contains', uid)),
      (snap) => {
        set({
          requests: snap.docs.map((d) => ({ ...(d.data() as MeetingRequest), id: d.id })),
          loading: false,
        })
      },
      () => set({ loading: false })
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count > 0) return
    get()._unsub?.()
    set({ _unsub: null })
  },

  byId: (id) => (id ? get().requests.find((r) => r.id === id) : undefined),

  claim: async (id, byUid, byName) => {
    await updateDoc(doc(db, 'meetingRequests', id), {
      claimedBy: byUid,
      claimedByName: byName,
      claimedAt: Date.now(),
    })
  },

  markHandled: async (id, byUid, byName) => {
    await updateDoc(doc(db, 'meetingRequests', id), {
      status: 'handled',
      handledBy: byUid,
      handledByName: byName,
      handledAt: Date.now(),
    })
  },

  /**
   * Stop the sender asking for any more meetings. Admins only, by the rules.
   *
   * Two writes in one batch: the block itself, which the sender can read and so
   * says only when and from which request, and who did it, on the request,
   * which they cannot.
   */
  block: async (request, byUid, byName) => {
    const at = Date.now()
    const block: MeetingBlock = { blockedAt: at, requestId: request.id }
    const batch = writeBatch(db)
    batch.set(doc(db, 'meetingBlocks', request.fromUid), block)
    batch.update(doc(db, 'meetingRequests', request.id), {
      blockedBy: byUid,
      blockedByName: byName,
      blockedAt: at,
    })
    await batch.commit()
  },

  /** Let them ask again, from whichever of their requests it is lifted. */
  unblock: async (request) => {
    const batch = writeBatch(db)
    batch.delete(doc(db, 'meetingBlocks', request.fromUid))
    batch.update(doc(db, 'meetingRequests', request.id), {
      blockedBy: deleteField(),
      blockedByName: deleteField(),
      blockedAt: deleteField(),
    })
    await batch.commit()
  },
}))
