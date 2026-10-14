import { create } from 'zustand'
import { collection, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { onSnapshot } from '@/lib/liveFirestore'
import { db, auth, functions } from '@/lib/firebase'
import type { Reimbursement, ReimbursementItem } from '@/types/reimbursement'

export interface SubmitReimbursementInput {
  eventId: string
  eventDate: string | null
  items: ReimbursementItem[]
  /** Storage paths of receipts already uploaded to the person's own folder. */
  receipts: string[]
  note: string
}

export interface DecisionInput {
  id: string
  decision: 'approve' | 'partial' | 'deny'
  approvedAmount?: number
  reason?: string
  payBy?: string
}

interface ReimbursementsStore {
  /** Requests the signed-in person asked for, and those sent to them to answer. */
  requests: Reimbursement[]
  loading: boolean
  _unsubs: (() => void)[]
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  byId: (id?: string) => Reimbursement | undefined
  submit: (input: SubmitReimbursementInput) => Promise<{ id: string; taskId: number }>
  decide: (input: DecisionInput) => Promise<void>
  requestPayDateChange: (id: string, proposed: string, reason: string) => Promise<void>
  answerPayDateChange: (id: string, accept: boolean) => Promise<void>
  markPaid: (id: string, note: string) => Promise<void>
}

/**
 * Every step is a callable: the rules let no client write a request, because
 * each step also moves the task and tells the other person. A failed call
 * throws with the server's own wording, which is written to be shown.
 */
async function call<T>(name: string, data: unknown): Promise<T> {
  const res = await httpsCallable(functions, name)(data)
  return res.data as T
}

export const useReimbursementsStore = create<ReimbursementsStore>((set, get) => {
  // Two listeners, one per side, merged by id. A single "mine or sent to me"
  // query is not something Firestore can prove safe against the rule, so it
  // would be refused outright.
  const mine: Record<'asked' | 'answering', Reimbursement[]> = { asked: [], answering: [] }
  const publish = () => {
    const byId = new Map<string, Reimbursement>()
    for (const r of [...mine.asked, ...mine.answering]) byId.set(r.id, r)
    set({
      requests: [...byId.values()].sort((a, b) => b.createdAt - a.createdAt),
      loading: false,
    })
  }

  return {
    requests: [],
    loading: false,
    _unsubs: [],
    _refCount: 0,

    subscribe: () => {
      const count = get()._refCount + 1
      set({ _refCount: count })
      if (count > 1) return
      const uid = auth.currentUser?.uid
      if (!uid) return
      set({ loading: true })

      const listen = (side: keyof typeof mine, field: string) =>
        onSnapshot(
          query(collection(db, 'reimbursements'), where(field, '==', uid)),
          (snap) => {
            mine[side] = snap.docs.map((d) => ({ ...(d.data() as Reimbursement), id: d.id }))
            publish()
          },
          () => set({ loading: false })
        )

      set({ _unsubs: [listen('asked', 'submitterUid'), listen('answering', 'accountantUid')] })
    },

    unsubscribe: () => {
      const count = Math.max(0, get()._refCount - 1)
      set({ _refCount: count })
      if (count > 0) return
      get()._unsubs.forEach((u) => u())
      mine.asked = []
      mine.answering = []
      set({ _unsubs: [], requests: [] })
    },

    byId: (id) => (id ? get().requests.find((r) => r.id === id) : undefined),

    submit: (input) => call('submitReimbursement', input),
    decide: async (input) => {
      await call('decideReimbursement', input)
    },
    requestPayDateChange: async (id, proposed, reason) => {
      await call('requestPayDateChange', { id, proposed, reason })
    },
    answerPayDateChange: async (id, accept) => {
      await call('answerPayDateChange', { id, accept })
    },
    markPaid: async (id, note) => {
      await call('markReimbursementPaid', { id, note })
    },
  }
})
