import { create } from 'zustand'

export interface DigestStatDoc {
  id: string
  type: 'weekly' | 'monthly'
  sentAt: unknown // Firestore Timestamp
  recipients: number
  delivered: number
  bounced: number
  opened: number
  batchId: string
}

interface DigestStore {
  stats: DigestStatDoc[]
  loading: boolean
  fetchStats: () => Promise<void>
}

export const useDigestStore = create<DigestStore>((set) => ({
  stats: [],
  loading: false,
  fetchStats: async () => {
    set({ loading: true })
    const { collection, getDocs, orderBy, query, limit } = await import('firebase/firestore')
    const { db } = await import('@/lib/firebase')
    const q = query(collection(db, 'digestStats'), orderBy('sentAt', 'desc'), limit(50))
    const snap = await getDocs(q)
    set({
      stats: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DigestStatDoc),
      loading: false,
    })
  },
}))
