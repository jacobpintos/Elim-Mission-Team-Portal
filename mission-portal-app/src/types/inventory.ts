export interface InventoryCategory {
  id: string | number
  name: string
  createdAt?: unknown
}

export interface InventoryItem {
  id: string | number
  name: string
  categoryId: string | number | null
  qty: number
  price: number
  createdAt?: unknown
  updatedAt?: unknown
}

export interface ReorderItem {
  id: string | number
  name: string
  price: number | null
  link: string
  createdAt?: unknown
  updatedAt?: unknown
}
