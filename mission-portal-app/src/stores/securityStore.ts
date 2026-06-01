import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import type { SecurityReport } from '@/types/security'

interface SecurityStore {
  reports: SecurityReport[]
  resolved: SecurityReport[]
  loading: boolean
  loadingResolved: boolean
  _unsub: (() => void) | null
  _unsubResolved: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  subscribeResolved: () => void
  unsubscribeResolved: () => void
  createReport: (
    data: Pick<
      SecurityReport,
      'description' | 'location' | 'witnesses' | 'reportedBy' | 'reporterName'
    >,
    photoFile?: File | null
  ) => Promise<string | number>
  setOnMyWay: (id: string | number, responderId: string, responderName: string) => Promise<void>
  resolveReport: (id: string | number, resolution: string) => Promise<void>
  deleteReport: (id: string | number) => Promise<void>
}

export const useSecurityStore = create<SecurityStore>((set, get) => ({
  reports: [],
  resolved: [],
  loading: false,
  loadingResolved: false,
  _unsub: null,
  _unsubResolved: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const q = query(
      collection(db, 'securityReports'),
      where('status', 'in', ['open', 'responding'])
    )
    const unsub = onSnapshot(q, (snap) => {
      const reports = snap.docs.map((d) => ({ ...(d.data() as SecurityReport), id: d.id }))
      reports.sort((a, b) => {
        const aTs = typeof a.createdAt === 'number' ? a.createdAt : 0
        const bTs = typeof b.createdAt === 'number' ? b.createdAt : 0
        return bTs - aTs
      })
      set({ reports, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, reports: [] })
  },

  subscribeResolved: () => {
    if (get()._unsubResolved) return
    set({ loadingResolved: true })
    const q = query(collection(db, 'securityReports'), where('status', '==', 'resolved'))
    const unsub = onSnapshot(q, (snap) => {
      const resolved = snap.docs.map((d) => ({ ...(d.data() as SecurityReport), id: d.id }))
      resolved.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      set({ resolved, loadingResolved: false })
    })
    set({ _unsubResolved: unsub })
  },

  unsubscribeResolved: () => {
    get()._unsubResolved?.()
    set({ _unsubResolved: null, resolved: [] })
  },

  createReport: async (data, photoFile) => {
    const id = await nextId('nReport')
    let photoURL: string | null = null

    if (photoFile) {
      const storageRef = ref(storage, `securityReports/${id}/photo`)
      await uploadBytes(storageRef, photoFile)
      photoURL = await getDownloadURL(storageRef)
    }

    await setDoc(doc(db, 'securityReports', String(id)), {
      ...data,
      id,
      photoURL,
      status: 'open',
      responderId: null,
      responderName: null,
      resolution: null,
      completedAt: null,
      deleteAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  },

  setOnMyWay: async (id, responderId, responderName) => {
    await updateDoc(doc(db, 'securityReports', String(id)), {
      status: 'responding',
      responderId,
      responderName,
      updatedAt: serverTimestamp(),
    })
  },

  resolveReport: async (id, resolution) => {
    const completedAt = Date.now()
    const deleteAt = completedAt + 30 * 24 * 60 * 60 * 1000
    await updateDoc(doc(db, 'securityReports', String(id)), {
      status: 'resolved',
      resolution,
      completedAt,
      deleteAt,
      updatedAt: serverTimestamp(),
    })
  },

  deleteReport: async (id) => {
    await deleteDoc(doc(db, 'securityReports', String(id)))
  },
}))
