import { create } from 'zustand'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { defaultClothingSizes, defaultNonClothingSizes } from '@/lib/merch'
import type {
  MerchItem, MerchTransaction, MerchDoc,
  ProductionItem, ProductionDoc,
  ReorderItem, ReorderDoc,
} from '@/types/inventory'

interface InventoryStore {
  items: MerchItem[]
  transactions: MerchTransaction[]
  nItem: number
  nTx: number
  productionItems: ProductionItem[]
  reorderItems: ReorderItem[]
  loading: boolean

  loadMerch: () => Promise<void>
  addMerchItem: (item: Omit<MerchItem, 'id' | 'sizes'>) => Promise<void>
  deleteMerchItem: (id: number) => Promise<void>
  recordAdj: (
    item: MerchItem,
    kind: 'cycle' | 'produce' | 'sale',
    sizes: Record<string, number>,
    opts?: { notes?: string; eventName?: string; eventLocation?: string; eventDate?: string }
  ) => Promise<void>

  loadProduction: () => Promise<void>
  addProductionRow: () => Promise<void>
  updateProductionRow: (id: number, patch: Partial<ProductionItem>) => Promise<void>
  deleteProductionRow: (id: number) => Promise<void>

  loadReorder: () => Promise<void>
  addReorderItem: (name: string, link: string) => Promise<void>
  updateReorderItem: (id: number, patch: { name?: string; link?: string }) => Promise<void>
  deleteReorderItem: (id: number) => Promise<void>

  _saveMerch: (i: MerchItem[], tx: MerchTransaction[], nI: number, nT: number) => Promise<void>
  _saveProduction: (items: ProductionItem[]) => Promise<void>
  _saveReorder: (items: ReorderItem[]) => Promise<void>
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  items: [], transactions: [], nItem: 1, nTx: 1,
  productionItems: [], reorderItems: [], loading: false,

  loadMerch: async () => {
    set({ loading: true })
    const snap = await getDoc(doc(db, 'merch', 'inventory'))
    if (snap.exists()) {
      const data = snap.data() as MerchDoc
      set({ items: data.items ?? [], transactions: data.transactions ?? [], nItem: data.nItem ?? 1, nTx: data.nTx ?? 1, loading: false })
    } else {
      set({ loading: false })
    }
  },

  addMerchItem: async (item) => {
    const { items, transactions, nItem, nTx } = get()
    const id = nItem
    const sizes = item.category === 'clothing' ? defaultClothingSizes() : defaultNonClothingSizes()
    const newItem: MerchItem = { ...item, id, sizes }
    const updated = [...items, newItem]
    const newNItem = nItem + 1
    set({ items: updated, nItem: newNItem })
    await get()._saveMerch(updated, transactions, newNItem, nTx)
  },

  deleteMerchItem: async (id) => {
    const { items, transactions, nItem, nTx } = get()
    const updated = items.filter((i) => i.id !== id)
    set({ items: updated })
    await get()._saveMerch(updated, transactions, nItem, nTx)
  },

  recordAdj: async (item, kind, sizes, opts = {}) => {
    const { items: storeItems, transactions, nItem, nTx } = get()
    const newTxs: MerchTransaction[] = []
    const updatedSizes = { ...item.sizes }
    let txId = nTx

    for (const [sz, entered] of Object.entries(sizes)) {
      if (entered === 0 && kind !== 'cycle') continue
      const prev = updatedSizes[sz] ?? 0
      let newQty: number
      if (kind === 'cycle') newQty = Math.max(0, entered)
      else if (kind === 'produce') newQty = prev + Math.abs(entered)
      else newQty = Math.max(0, prev - Math.abs(entered))

      updatedSizes[sz] = newQty

      if (entered !== 0 || kind === 'cycle') {
        newTxs.push({
          id: txId++,
          itemId: item.id, itemName: item.name,
          kind, size: sz, qty: Math.abs(entered),
          price: item.price, notes: opts.notes, ts: Date.now(),
          eventName: kind === 'sale' ? (opts.eventName ?? null) : undefined,
          eventLocation: kind === 'sale' ? (opts.eventLocation ?? null) : undefined,
          eventDate: kind === 'sale' ? (opts.eventDate ?? null) : undefined,
        })
      }
    }

    const updatedItems = storeItems.map((i) => i.id === item.id ? { ...i, sizes: updatedSizes } : i)
    const updatedTxs = [...transactions, ...newTxs]
    set({ items: updatedItems, transactions: updatedTxs, nTx: txId })
    await get()._saveMerch(updatedItems, updatedTxs, nItem, txId)
  },

  loadProduction: async () => {
    const snap = await getDoc(doc(db, 'inventory', 'production'))
    if (snap.exists()) set({ productionItems: (snap.data() as ProductionDoc).items ?? [] })
  },

  addProductionRow: async () => {
    const { productionItems } = get()
    const id = Date.now() + Math.floor(Math.random() * 1000)
    const newRow: ProductionItem = { id, item: '', type: '', length: '', location: 'Big Trailer', qty: 0, unitPrice: 0 }
    const updated = [...productionItems, newRow]
    set({ productionItems: updated })
    await get()._saveProduction(updated)
  },

  updateProductionRow: async (id, patch) => {
    const updated = get().productionItems.map((r) => r.id === id ? { ...r, ...patch } : r)
    set({ productionItems: updated })
    await get()._saveProduction(updated)
  },

  deleteProductionRow: async (id) => {
    const updated = get().productionItems.filter((r) => r.id !== id)
    set({ productionItems: updated })
    await get()._saveProduction(updated)
  },

  loadReorder: async () => {
    const snap = await getDoc(doc(db, 'inventory', 'reorder'))
    if (snap.exists()) set({ reorderItems: (snap.data() as ReorderDoc).items ?? [] })
  },

  addReorderItem: async (name, link) => {
    const updated = [...get().reorderItems, { id: Date.now(), name, link }]
    set({ reorderItems: updated })
    await get()._saveReorder(updated)
  },

  updateReorderItem: async (id, patch) => {
    const updated = get().reorderItems.map((r) => r.id === id ? { ...r, ...patch } : r)
    set({ reorderItems: updated })
    await get()._saveReorder(updated)
  },

  deleteReorderItem: async (id) => {
    const updated = get().reorderItems.filter((r) => r.id !== id)
    set({ reorderItems: updated })
    await get()._saveReorder(updated)
  },

  _saveMerch: async (i, tx, nI, nT) => setDoc(doc(db, 'merch', 'inventory'), { items: i, transactions: tx, nItem: nI, nTx: nT }),
  _saveProduction: async (items) => setDoc(doc(db, 'inventory', 'production'), { items }),
  _saveReorder: async (items) => setDoc(doc(db, 'inventory', 'reorder'), { items }),
}))
