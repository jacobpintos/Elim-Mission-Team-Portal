import { create } from 'zustand'
import { collection, getDocs, setDoc, deleteDoc, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addInAppNotif } from '@/lib/inAppNotifs'
import { addAuditEntry } from '@/lib/audit'
import type { ProductionIssue } from '@/types/issues'

interface IssuesState {
  issues:  ProductionIssue[]
  loading: boolean
  loadIssues:  () => Promise<void>
  createIssue: (
    data: Omit<ProductionIssue, 'id' | 'reporter' | 'ts'>,
    reporterUid: string,
    adminUids: string[]
  ) => Promise<void>
  updateIssue: (
    id: number,
    patch: Partial<ProductionIssue>,
    currentUserUid: string
  ) => Promise<void>
  deleteIssue: (id: number) => Promise<void>
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issues: [],
  loading: false,

  loadIssues: async () => {
    set({ loading: true })
    try {
      const snap = await getDocs(collection(db, 'issues'))
      const issues = snap.docs.map(d => d.data() as ProductionIssue)
      issues.sort((a, b) => b.ts - a.ts)
      set({ issues, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createIssue: async (data, reporterUid, adminUids) => {
    const id = await nextId('nIssue')
    const issue: ProductionIssue = {
      ...data,
      id,
      reporter: reporterUid,
      ts: Date.now(),
    }
    await setDoc(doc(db, 'issues', String(id)), issue)
    set(s => ({ issues: [issue, ...s.issues] }))

    if (issue.caOwner && issue.ca) {
      await _handleCATask(issue, id, issue, reporterUid)
    }

    for (const uid of adminUids) {
      if (uid !== reporterUid) {
        await addInAppNotif(uid, `New issue logged: "${issue.title}"`, 'issue')
      }
    }
    await addAuditEntry(reporterUid, 'Issue Created', issue.title)
  },

  updateIssue: async (id, patch, currentUserUid) => {
    const existing = get().issues.find(i => i.id === id)
    if (!existing) return
    const updated: ProductionIssue = { ...existing, ...patch }
    await setDoc(doc(db, 'issues', String(id)), updated)
    set(s => ({ issues: s.issues.map(i => i.id === id ? updated : i) }))

    if (updated.caOwner && updated.ca) {
      await _handleCATask(existing, id, updated, currentUserUid)
    }

    await addAuditEntry(currentUserUid, 'Issue Updated', updated.title)
  },

  deleteIssue: async (id) => {
    await deleteDoc(doc(db, 'issues', String(id)))
    set(s => ({ issues: s.issues.filter(i => i.id !== id) }))
  },
}))

async function _handleCATask(
  existing: ProductionIssue,
  id: number,
  updated: ProductionIssue,
  currentUserUid: string
) {
  if (!updated.caOwner || !updated.ca) return
  const { useTasksStore } = await import('@/stores/tasksStore')
  const tasksStore = useTasksStore.getState()

  if (existing.caDueTaskId) {
    const taskSnap = await getDoc(doc(db, 'tasks', String(existing.caDueTaskId)))
    if (taskSnap.exists()) {
      await tasksStore.updateTask(existing.caDueTaskId, {
        title: `CA: ${updated.ca.slice(0, 60)}`,
        dueDate: updated.caDueDate ?? null,
        assignees: [updated.caOwner],
        lead: updated.caOwner,
      })
      await addInAppNotif(
        updated.caOwner,
        `Corrective action task updated for issue: "${updated.title}"`,
        'task'
      )
      return
    }
  }

  const taskId = await nextId('nTask')
  await tasksStore.createTask({
    id: taskId,
    title: `CA: ${updated.ca.slice(0, 60)}`,
    assignees: [updated.caOwner],
    lead: updated.caOwner,
    by: currentUserUid,
    status: 'pending',
    issueId: id,
    issueTitle: updated.title,
    kaizenId: null,
    evId: null,
    evDate: null,
    dueDate: updated.caDueDate ?? null,
    overdueNotified: false,
    sourceGroupIds: [],
  })

  await setDoc(doc(db, 'issues', String(id)), { caDueTaskId: taskId }, { merge: true })
  useIssuesStore.setState(s => ({
    issues: s.issues.map(i => i.id === id ? { ...i, caDueTaskId: taskId } : i),
  }))

  await addInAppNotif(
    updated.caOwner,
    `New corrective action task for issue: "${updated.title}"`,
    'task'
  )
}
