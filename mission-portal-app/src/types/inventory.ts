export interface MerchItem {
  id: number
  name: string
  category: 'books' | 'hats' | 'clothing'
  sub: string | null // clothing subcategory only; null for others
  sizes: Record<string, number>
  // clothing sizes: S, M, L, XL, 2XL, 3XL → quantity
  // non-clothing: { one: quantity }
  price: number // per unit price
}

export interface MerchTransaction {
  id: number
  itemId: number
  itemName: string
  kind: 'cycle' | 'produce' | 'sale'
  size: string // 'S' | 'M' | ... | 'one'
  qty: number
  price: number // per unit (item.price at time of sale)
  notes?: string
  ts: number
  // sale-only context fields:
  eventName?: string | null
  eventLocation?: string | null
  eventDate?: string | null // 'YYYY-MM-DD'
}

export interface MerchDoc {
  items: MerchItem[]
  transactions: MerchTransaction[]
  nItem: number
  nTx: number
}

export interface ProductionItem {
  id: number // Date.now() + random, used as key
  item: string // e.g. "XLR Cable"
  type: string // e.g. "Cable", "Stand", "Light"
  length: string // e.g. "25" (feet), free text
  location: string // one of PRODUCTION_LOCATIONS
  qty: number
  unitPrice: number
}

export interface ProductionDoc {
  items: ProductionItem[]
}

export interface ReorderItem {
  id: number // Date.now() at creation
  name: string
  link: string // must start with http:// or https://
}

export interface ReorderDoc {
  items: ReorderItem[]
}
