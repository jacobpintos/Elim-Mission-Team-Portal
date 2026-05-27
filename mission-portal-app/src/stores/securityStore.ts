import { create } from 'zustand'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addInAppNotif } from '@/lib/inAppNotifs'
import { addAuditEntry } from '@/lib/audit'
import type { SecurityReport, AckNote } from '@/types/security'
import type { Attachment } from '@/types/shared'

interface SecurityStore {
  reports: SecurityReport[]
  loading: boolean
  _unsub: (() => void) | null

  subscribe: () => void
  unsubscribe: () => void
  loadReports: () => Promise<void>
  submitReport: (
    data: { type: string; loc: string; desc: string; witness?: string; attachment?: Attachment | null },
    submitterUid: string,
    notifyUids: string[]
  ) => Promise<void>
  acknowledgeReport: (
    reportId: number,
    note: string,
    byUid: string,
    attachment?: Attachment | null
  ) => Promise<void>
  clearAcknowledged: () => Promise<void>
}

export const useSecurityStore = create<SecurityStore>((set, get) => ({
  reports: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'reports'), (snap) => {
      const reports: SecurityReport[] = snap.docs
        .map((d) => d.data() as SecurityReport)
        .sort((a, b) => b.ts - a.ts)
      set({ reports, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, reports: [], loading: false })
  },

  loadReports: async () => {
    set({ loading: true })
    const snap = await getDocs(collection(db, 'reports'))
    const reports: SecurityReport[] = snap.docs
      .map((d) => d.data() as SecurityReport)
      .sort((a, b) => b.ts - a.ts)
    set({ reports, loading: false })
  },

  submitReport: async (data, submitterUid, notifyUids) => {
    const id = await nextId('nReport')
    const report: SecurityReport = {
      id,
      reporter: submitterUid,
      type: data.type,
      loc: data.loc,
      desc: data.desc,
      witness: data.witness,
      attachment: data.attachment ?? null,
      ts: Date.now(),
      ack: false,
      ackNotes: [],
    }
    await setDoc(doc(db, 'reports', String(id)), report)

    for (const uid of notifyUids) {
      try {
        await addInAppNotif(uid, `New security report: ${data.type} at ${data.loc}`, 'security')
      } catch { /* non-fatal */ }
    }
    await addAuditEntry(submitterUid, 'Security Report Submitted', `${data.type} at ${data.loc}`)
  },

  acknowledgeReport: async (reportId, note, byUid, attachment) => {
    const report = get().reports.find((r) => r.id === reportId)
    if (!report) return

    const ackNote: AckNote = { note, attachment: attachment ?? null, by: byUid, ts: Date.now() }
    const updated: SecurityReport = {
      ...report,
      ack: true,
      ackNotes: [...(report.ackNotes ?? []), ackNote],
    }

    await setDoc(doc(db, 'reports', String(reportId)), updated)

    try {
      await addInAppNotif(
        report.reporter,
        `Your ${report.type} report ("${report.loc}") has been acknowledged by the security team.`,
        'security'
      )
    } catch { /* non-fatal */ }

    await addAuditEntry(byUid, 'Security Report Acknowledged', `${report.type} at ${report.loc}`)
  },

  clearAcknowledged: async () => {
    const snap = await getDocs(query(collection(db, 'reports'), where('ack', '==', true)))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  },
}))
