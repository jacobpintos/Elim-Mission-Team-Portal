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
import type { InventoryCategory, InventoryItem, ReorderItem } from '@/types/inventory'

interface InventoryStore {
  categories: InventoryCategory[]
  items: InventoryItem[]
  reorderItems: ReorderItem[]
  loading: boolean
  _unsubs: (() => void)[]
  subscribe: () => void
  unsubscribe: () => void
  createCategory: (name: string) => Promise<void>
  deleteCategory: (id: string | number) => Promise<void>
  createItem: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateItem: (id: string | number, data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  deleteItem: (id: string | number) => Promise<void>
  createReorderItem: (data: Omit<ReorderItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateReorderItem: (id: string | number, data: Omit<ReorderItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  deleteReorderItem: (id: string | number) => Promise<void>
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  categories: [],
  items: [],
  reorderItems: [],
  loading: false,
  _unsubs: [],

  subscribe: () => {
    if (get()._unsubs.length > 0) return
    set({ loading: true })

    const u1 = onSnapshot(collection(db, 'inventoryCategories'), (snap) => {
      const categories = snap.docs.map((d) => ({ ...d.data(), id: d.id } as InventoryCategory))
      set({ categories })
    })
    const u2 = onSnapshot(collection(db, 'inventoryItems'), (snap) => {
      const items = snap.docs.map((d) => ({ ...d.data(), id: d.id } as InventoryItem))
      set({ items, loading: false })
    })
    const u3 = onSnapshot(collection(db, 'reorderItems'), (snap) => {
      const reorderItems = snap.docs.map((d) => ({ ...d.data(), id: d.id } as ReorderItem))
      set({ reorderItems })
    })

    set({ _unsubs: [u1, u2, u3] })
  },

  unsubscribe: () => {
    get()._unsubs.forEach((u) => u())
    set({ _unsubs: [], categories: [], items: [], reorderItems: [] })
  },

  createCategory: async (name) => {
    const id = await nextId('nInventoryCategory')
    await setDoc(doc(db, 'inventoryCategories', String(id)), {
      id,
      name,
      createdAt: serverTimestamp(),
    })
  },

  deleteCategory: async (id) => {
    await deleteDoc(doc(db, 'inventoryCategories', String(id)))
  },

  createItem: async (data) => {
    const id = await nextId('nInventoryItem')
    const payload = Object.fromEntries(
      Object.entries({ ...data, id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        .filter(([, v]) => v !== undefined),
    )
    await setDoc(doc(db, 'inventoryItems', String(id)), payload)
  },

  updateItem: async (id, data) => {
    const payload = Object.fromEntries(
      Object.entries({ ...data, updatedAt: serverTimestamp() })
        .filter(([, v]) => v !== undefined),
    )
    await updateDoc(doc(db, 'inventoryItems', String(id)), payload)
  },

  deleteItem: async (id) => {
    await deleteDoc(doc(db, 'inventoryItems', String(id)))
  },

  createReorderItem: async (data) => {
    const id = await nextId('nReorderItem')
    const payload = Object.fromEntries(
      Object.entries({ ...data, id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        .filter(([, v]) => v !== undefined),
    )
    await setDoc(doc(db, 'reorderItems', String(id)), payload)
  },

  updateReorderItem: async (id, data) => {
    const payload = Object.fromEntries(
      Object.entries({ ...data, updatedAt: serverTimestamp() })
        .filter(([, v]) => v !== undefined),
    )
    await updateDoc(doc(db, 'reorderItems', String(id)), payload)
  },

  deleteReorderItem: async (id) => {
    await deleteDoc(doc(db, 'reorderItems', String(id)))
  },
}))
