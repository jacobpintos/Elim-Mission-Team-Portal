import { create } from 'zustand'

// Skeleton store for announce domain.
// Phase 2+ wires Firestore subscriptions and fills in state.

interface AnnounceStore {
  items: unknown[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
}

export const useAnnounceStore = create<AnnounceStore>((set, get) => ({
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
