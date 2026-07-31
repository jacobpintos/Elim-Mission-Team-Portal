import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { sameId } from '@/lib/ids'
import { useEventsStore } from '@/stores/eventsStore'
import type { PlanningBoard, PlanningItem } from '@/types/operations'

interface PlanningStore {
  boards: PlanningBoard[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  createBoard: (name: string, createdBy: string | number) => Promise<string | number>
  renameBoard: (id: string | number, name: string) => Promise<void>
  linkToEvent: (
    boardId: string | number,
    eventId: string | number | null,
    currentEventId?: string | number | null
  ) => Promise<void>
  deleteBoard: (id: string | number) => Promise<void>
  /** Resolves to the new item's id, so callers can select or focus it. */
  addItem: (boardId: string | number, item: Omit<PlanningItem, 'id'>) => Promise<string>
  updateItem: (
    boardId: string | number,
    itemId: string,
    patch: Partial<PlanningItem>
  ) => Promise<void>
  deleteItem: (boardId: string | number, itemId: string) => Promise<void>
}

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  boards: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'planningBoards'), (snap) => {
      const boards = snap.docs.map((d) => ({ ...(d.data() as PlanningBoard), id: d.id }))
      set({ boards, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, boards: [] })
  },

  createBoard: async (name, createdBy) => {
    const id = await nextId('nPlan')
    await setDoc(doc(db, 'planningBoards', String(id)), {
      id,
      name,
      createdBy,
      items: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  },

  renameBoard: async (id, name) => {
    set((s) => ({
      boards: s.boards.map((b) => (sameId(b.id, id) ? { ...b, name } : b)),
    }))
    await updateDoc(doc(db, 'planningBoards', String(id)), {
      name,
      updatedAt: serverTimestamp(),
    })
  },

  linkToEvent: async (boardId, eventId, currentEventId) => {
    // Clear old event link
    if (currentEventId != null) {
      await useEventsStore.getState().updateEvent(currentEventId, { planningBoardId: undefined })
    }
    // Set new event link
    if (eventId != null) {
      await useEventsStore.getState().updateEvent(eventId, { planningBoardId: boardId })
    }
    // Update board
    set((s) => ({
      boards: s.boards.map((b) =>
        sameId(b.id, boardId) ? { ...b, eventId: eventId ?? undefined } : b
      ),
    }))
    await updateDoc(doc(db, 'planningBoards', String(boardId)), {
      eventId: eventId ?? null,
      updatedAt: serverTimestamp(),
    })
  },

  deleteBoard: async (id) => {
    set((s) => ({ boards: s.boards.filter((b) => !sameId(b.id, id)) }))
    await deleteDoc(doc(db, 'planningBoards', String(id)))
  },

  addItem: async (boardId, item) => {
    const itemId = `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newItem: PlanningItem = { ...item, id: itemId }
    set((s) => ({
      boards: s.boards.map((b) =>
        sameId(b.id, boardId) ? { ...b, items: [...b.items, newItem] } : b
      ),
    }))
    const board = get().boards.find((b) => sameId(b.id, boardId))
    if (!board) return itemId
    await updateDoc(doc(db, 'planningBoards', String(boardId)), {
      items: board.items,
      updatedAt: serverTimestamp(),
    })
    return itemId
  },

  updateItem: async (boardId, itemId, patch) => {
    set((s) => ({
      boards: s.boards.map((b) =>
        sameId(b.id, boardId)
          ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
          : b
      ),
    }))
    const board = get().boards.find((b) => sameId(b.id, boardId))
    if (!board) return
    await updateDoc(doc(db, 'planningBoards', String(boardId)), {
      items: board.items,
      updatedAt: serverTimestamp(),
    })
  },

  deleteItem: async (boardId, itemId) => {
    set((s) => ({
      boards: s.boards.map((b) =>
        sameId(b.id, boardId) ? { ...b, items: b.items.filter((it) => it.id !== itemId) } : b
      ),
    }))
    const board = get().boards.find((b) => sameId(b.id, boardId))
    if (!board) return
    await updateDoc(doc(db, 'planningBoards', String(boardId)), {
      items: board.items,
      updatedAt: serverTimestamp(),
    })
  },
}))
