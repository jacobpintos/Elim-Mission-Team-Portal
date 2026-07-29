import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { useTasksStore } from '@/stores/tasksStore'
import type { IssueReport, IssueCategory, IssueCorrectiveAction, IssueStatus } from '@/types/operations'

interface IssuesStore {
  issues: IssueReport[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  createIssue: (data: {
    title: string
    description: string
    category: IssueCategory
    suggestedAction: string
    reportedBy: string | number
  }) => Promise<string | number>
  updateStatus: (id: string | number, status: IssueStatus) => Promise<void>
  saveRootCause: (
    id: string | number,
    whys: string[],
    rootCause: string,
    adminId: string | number
  ) => Promise<void>
  addCorrectiveAction: (
    id: string | number,
    action: Omit<IssueCorrectiveAction, 'id' | 'taskId'>,
    assignedBy: string | number
  ) => Promise<void>
}

export const useIssuesStore = create<IssuesStore>((set, get) => ({
  issues: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'issues'), (snap) => {
      const issues = snap.docs.map((d) => ({ ...(d.data() as IssueReport), id: d.id }))
      set({ issues, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, issues: [] })
  },

  createIssue: async (data) => {
    const id = await nextId('nReport')
    await setDoc(doc(db, 'issues', String(id)), {
      ...data,
      id,
      status: 'pending_review' as IssueStatus,
      whys: [],
      rootCause: '',
      correctiveActions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return id
  },

  updateStatus: async (id, status) => {
    await updateDoc(doc(db, 'issues', String(id)), {
      status,
      updatedAt: serverTimestamp(),
    })
  },

  saveRootCause: async (id, whys, rootCause, adminId) => {
    await updateDoc(doc(db, 'issues', String(id)), {
      whys,
      rootCause,
      adminId,
      status: 'root_cause_identified' as IssueStatus,
      updatedAt: serverTimestamp(),
    })
  },

  addCorrectiveAction: async (id, action, assignedBy) => {
    const issue = get().issues.find((i) => String(i.id) === String(id))
    if (!issue) return

    const taskId = await useTasksStore.getState().createTask({
      title: `[Issue #${id}] ${action.description}`,
      assignees: [action.assignee],
      lead: null,
      by: assignedBy,
      status: 'pending',
      dueDate: action.dueDate,
      taskType: 'issue_corrective',
      issueId: id,
    })

    const newAction: IssueCorrectiveAction = {
      id: `ca_${Date.now()}`,
      description: action.description,
      assignee: action.assignee,
      dueDate: action.dueDate,
      taskId,
    }

    const actions = [...(issue.correctiveActions ?? []), newAction]
    await updateDoc(doc(db, 'issues', String(id)), {
      correctiveActions: actions,
      status: 'actions_assigned' as IssueStatus,
      updatedAt: serverTimestamp(),
    })

    // Tell the assignee they now own a corrective action.
    httpsCallable(
      functions,
      'sendNotification'
    )({
      uid: String(action.assignee),
      type: 'issueAssigned',
      data: { title: action.description, issueId: String(id), taskId: String(taskId) },
    }).catch(() => {})
  },
}))
