import { create } from 'zustand'
import {
  collection, getDocs, setDoc, deleteDoc, doc, onSnapshot, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addAuditEntry } from '@/lib/audit'
import type { PlanningBoard, BoardElement } from '@/types/planning'

interface PlanningState {
  boards:   PlanningBoard[]
  loading:  boolean
  elements:  Record<number, BoardElement[]>
  listeners: Record<number, () => void>

  loadBoards:        () => Promise<void>
  createBoard:       (data: { name: string; eventId?: number | null }, creatorUid: string) => Promise<void>
  updateBoard:       (id: number, patch: { name?: string; eventId?: number | null }) => Promise<void>
  deleteBoard:       (id: number) => Promise<void>

  subscribeBoard:    (boardId: number) => void
  unsubscribeBoard:  (boardId: number) => void
  upsertElement:     (boardId: number, el: BoardElement) => Promise<void>
  deleteElement:     (boardId: number, elementId: string) => Promise<void>
  batchMoveElements: (boardId: number, moves: Array<{ id: string; x: number; y: number }>) => Promise<void>
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  boards: [],
  loading: false,
  elements: {},
  listeners: {},

  loadBoards: async () => {
    set({ loading: true })
    try {
      const snap = await getDocs(collection(db, 'planningBoards'))
      const boards = snap.docs.map(d => d.data() as PlanningBoard)
      set({ boards, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createBoard: async (data, creatorUid) => {
    const id = await nextId('nBoard')
    const board: PlanningBoard = {
      id,
      name: data.name,
      eventId: data.eventId ?? null,
      createdBy: creatorUid,
      ts: Date.now(),
    }
    await setDoc(doc(db, 'planningBoards', String(id)), board)
    set(s => ({ boards: [...s.boards, board] }))
    await addAuditEntry(creatorUid, 'Planning Board Created', board.name)
  },

  updateBoard: async (id, patch) => {
    const board = get().boards.find(b => b.id === id)
    if (!board) return
    const updated = { ...board, ...patch }
    await setDoc(doc(db, 'planningBoards', String(id)), updated)
    set(s => ({ boards: s.boards.map(b => b.id === id ? updated : b) }))
  },

  deleteBoard: async (id) => {
    const elemSnap = await getDocs(collection(db, 'planningBoards', String(id), 'elements'))
    const batch = writeBatch(db)
    elemSnap.docs.forEach(d => batch.delete(d.ref))
    batch.delete(doc(db, 'planningBoards', String(id)))
    await batch.commit()
    set(s => ({
      boards: s.boards.filter(b => b.id !== id),
      elements: Object.fromEntries(
        Object.entries(s.elements).filter(([k]) => Number(k) !== id)
      ),
    }))
  },

  subscribeBoard: (boardId) => {
    if (get().listeners[boardId]) return
    const unsub = onSnapshot(
      collection(db, 'planningBoards', String(boardId), 'elements'),
      snap => {
        const els = snap.docs.map(d => d.data() as BoardElement)
        set(s => ({ elements: { ...s.elements, [boardId]: els } }))
      }
    )
    set(s => ({ listeners: { ...s.listeners, [boardId]: unsub } }))
  },

  unsubscribeBoard: (boardId) => {
    get().listeners[boardId]?.()
    set(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [boardId]: _removed, ...rest } = s.listeners
      return { listeners: rest }
    })
  },

  upsertElement: async (boardId, el) => {
    await setDoc(
      doc(db, 'planningBoards', String(boardId), 'elements', el.id),
      { ...el, updatedAt: Date.now() },
      { merge: true }
    )
  },

  deleteElement: async (boardId, elementId) => {
    await deleteDoc(doc(db, 'planningBoards', String(boardId), 'elements', elementId))
  },

  batchMoveElements: async (boardId, moves) => {
    await Promise.all(
      moves.map(m =>
        setDoc(
          doc(db, 'planningBoards', String(boardId), 'elements', m.id),
          { x: m.x, y: m.y, updatedAt: Date.now() },
          { merge: true }
        )
      )
    )
  },
}))
