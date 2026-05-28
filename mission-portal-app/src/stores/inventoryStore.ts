import { create } from 'zustand'

// Skeleton store for inventory domain.
// Phase 2+ wires Firestore subscriptions and fills in state.

interface InventoryStore {
  items: unknown[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
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
