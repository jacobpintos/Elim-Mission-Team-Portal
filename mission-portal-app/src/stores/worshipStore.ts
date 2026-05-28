import { create } from 'zustand'

// Skeleton store for worship domain.
// Phase 2+ wires Firestore subscriptions and fills in state.

interface WorshipStore {
  items: unknown[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
}

export const useWorshipStore = create<WorshipStore>((set, get) => ({
  items: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    // Phase 2+ wires Firestore onSnapshot here (role-gated)
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },
}))
