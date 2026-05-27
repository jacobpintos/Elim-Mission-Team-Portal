import { create } from 'zustand'
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { addInAppNotif } from '@/lib/inAppNotifs'
import { addAuditEntry } from '@/lib/audit'
import { sameId } from '@/lib/ids'
import type { KaizenItem, ActionPlan } from '@/types/kaizen'

const todayStr = () => new Date().toISOString().split('T')[0]

interface KaizenState {
  items:   KaizenItem[]
  loading: boolean
  loadItems:        () => Promise<void>
  submitIdea:       (
    data: { title: string; category: string; description?: string; linkedIssueId?: number | null },
    submitterUid: string,
    adminUids: string[]
  ) => Promise<void>
  updateItem:       (id: number, patch: Partial<KaizenItem>) => Promise<void>
  advanceStage:     (id: number, toStage: KaizenItem['stage']) => Promise<void>
  retractStage:     (id: number) => Promise<void>
  createActionPlan: (
    id: number,
    ap: Omit<ActionPlan, 'ts' | 'version'>,
    currentUserUid: string
  ) => Promise<void>
  recordOutcome:    (
    id: number,
    worked: boolean,
    notes: string,
    currentUserUid: string
  ) => Promise<void>
  toggleVote:       (id: number, uid: string) => Promise<void>
  toggleStepDone:   (kaizenId: number, stepIdx: number) => Promise<void>
  deleteItem:       (
    id: number,
    reason: string,
    adminUid: string,
    adminName: string
  ) => Promise<void>
}

export const useKaizenStore = create<KaizenState>((set, get) => ({
  items: [],
  loading: false,

  loadItems: async () => {
    set({ loading: true })
    try {
      const snap = await getDocs(collection(db, 'kaizen'))
      const items = snap.docs.map(d => d.data() as KaizenItem)
      set({ items, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  submitIdea: async (data, submitterUid, adminUids) => {
    const id = await nextId('nKaizen')
    const item: KaizenItem = {
      id,
      title: data.title,
      category: data.category,
      description: data.description,
      linkedIssueId: data.linkedIssueId ?? null,
      stage: 'idea',
      submitter: submitterUid,
      votes: 0,
      voters: [],
      actionPlans: [],
      ts: Date.now(),
    }
    await setDoc(doc(db, 'kaizen', String(id)), item)
    set(s => ({ items: [...s.items, item] }))

    for (const uid of adminUids) {
      if (uid !== submitterUid) {
        await addInAppNotif(uid, `New improvement idea: "${item.title}"`, 'kaizen')
      }
    }
    await addAuditEntry(submitterUid, 'Kaizen Created', item.title)
  },

  updateItem: async (id, patch) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const updated = { ...item, ...patch }
    await setDoc(doc(db, 'kaizen', String(id)), updated)
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
  },

  advanceStage: async (id, toStage) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    if (toStage === 'review') {
      const updated = { ...item, stage: 'review' as KaizenItem['stage'] }
      await setDoc(doc(db, 'kaizen', String(id)), updated)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    }
    // 'action' is handled via createActionPlan; 'complete' via recordOutcome
  },

  retractStage: async (id) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const order: KaizenItem['stage'][] = ['idea', 'review', 'action', 'complete']
    const idx = order.indexOf(item.stage)
    if (idx <= 0) return
    const prevStage = order[idx - 1]

    let updatedPlans = item.actionPlans
    if (item.stage === 'action' && item.actionPlans.length > 0) {
      const lastIdx = item.actionPlans.length - 1
      updatedPlans = item.actionPlans.map((p, i) =>
        i === lastIdx
          ? { ...p, outcome: 'archived' as const, outcomeNotes: 'Moved back before completion', outcomeDate: todayStr() }
          : p
      )
      await _deleteKaizenTasks(id)
    }

    const updated = { ...item, stage: prevStage, actionPlans: updatedPlans }
    await setDoc(doc(db, 'kaizen', String(id)), updated)
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
  },

  createActionPlan: async (id, apData, currentUserUid) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const version = item.actionPlans.length + 1
    const ap: ActionPlan = { ...apData, version, ts: Date.now() }
    const updated = { ...item, stage: 'action' as KaizenItem['stage'], actionPlans: [...item.actionPlans, ap] }
    await setDoc(doc(db, 'kaizen', String(id)), updated)
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))

    const { useTasksStore } = await import('@/stores/tasksStore')
    const tasksStore = useTasksStore.getState()
    for (const step of ap.steps) {
      if (step.assignee) {
        const taskId = await nextId('nTask')
        await tasksStore.createTask({
          id: taskId,
          title: step.title,
          assignees: [step.assignee],
          lead: step.assignee,
          by: currentUserUid,
          status: 'pending',
          kaizenId: id,
          issueId: null,
          issueTitle: null,
          evId: null,
          evDate: null,
          dueDate: step.dueDate ?? null,
          overdueNotified: false,
          sourceGroupIds: [],
        })
        await addInAppNotif(
          step.assignee,
          `New Kaizen task: "${step.title}" for "${item.title}"`,
          'task'
        )
      }
    }
    await addAuditEntry(currentUserUid, `Kaizen Action Plan v${version}`, item.title)
  },

  recordOutcome: async (id, worked, notes, currentUserUid) => {
    const item = get().items.find(i => i.id === id)
    if (!item || item.actionPlans.length === 0) return
    const lastIdx = item.actionPlans.length - 1
    const today = todayStr()
    const updatedPlans = item.actionPlans.map((p, i) =>
      i === lastIdx
        ? { ...p, outcome: (worked ? 'worked' : 'failed') as ActionPlan['outcome'], outcomeNotes: notes, outcomeDate: today }
        : p
    )
    const updated: KaizenItem = {
      ...item,
      actionPlans: updatedPlans,
      ...(worked ? { stage: 'complete' as KaizenItem['stage'], completedDate: today } : {}),
    }
    await setDoc(doc(db, 'kaizen', String(id)), updated)
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    await _deleteKaizenTasks(id)
    if (worked) {
      await addAuditEntry(currentUserUid, 'Kaizen Completed', item.title)
    }
  },

  toggleVote: async (id, uid) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const hasVoted = item.voters.includes(uid)
    const updated = {
      ...item,
      voters: hasVoted ? item.voters.filter(v => v !== uid) : [...item.voters, uid],
      votes: hasVoted ? item.votes - 1 : item.votes + 1,
    }
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    await setDoc(doc(db, 'kaizen', String(id)), updated)
  },

  toggleStepDone: async (kaizenId, stepIdx) => {
    const item = get().items.find(i => i.id === kaizenId)
    if (!item || item.actionPlans.length === 0) return
    const lastIdx = item.actionPlans.length - 1
    const ap = item.actionPlans[lastIdx]
    const updatedSteps = ap.steps.map((s, i) => i === stepIdx ? { ...s, done: !s.done } : s)
    const updatedPlans = item.actionPlans.map((p, i) => i === lastIdx ? { ...p, steps: updatedSteps } : p)
    const updated = { ...item, actionPlans: updatedPlans }
    set(s => ({ items: s.items.map(i => i.id === kaizenId ? updated : i) }))
    await setDoc(doc(db, 'kaizen', String(kaizenId)), updated)
  },

  deleteItem: async (id, reason, adminUid, adminName) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return

    // Find or create DM room
    try {
      const { useMessagesStore, sendMessageAs } = await import('@/stores/messagesStore')
      const rooms = useMessagesStore.getState().rooms
      let dmRoom = rooms.find(r =>
        r.members.length === 2 &&
        r.members.some(m => sameId(m, adminUid)) &&
        r.members.some(m => sameId(m, item.submitter))
      )
      if (!dmRoom) {
        const roomId = await nextId('nRoom')
        const { useUsersStore } = await import('@/stores/usersStore')
        const submitterName = useUsersStore.getState().displayName(item.submitter)
        const newRoom = {
          id: roomId,
          name: `Kaizen: ${submitterName}`,
          members: [adminUid, item.submitter],
          call: false,
          reviewers: [],
        }
        await setDoc(doc(db, 'rooms', String(roomId)), newRoom)
        dmRoom = newRoom as typeof dmRoom
      }
      if (dmRoom) {
        await sendMessageAs(
          dmRoom.id,
          adminUid,
          `Your idea "${item.title}" was removed by ${adminName}: ${reason}`
        )
      }
    } catch { /* messaging non-critical */ }

    await addInAppNotif(
      item.submitter,
      `Your Kaizen idea "${item.title}" was removed: ${reason}`,
      'kaizen'
    )
    await _deleteKaizenTasks(id)
    await deleteDoc(doc(db, 'kaizen', String(id)))
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
    await addAuditEntry(adminUid, 'Kaizen Deleted', item.title)
  },
}))

async function _deleteKaizenTasks(kaizenId: number) {
  const { useTasksStore } = await import('@/stores/tasksStore')
  const tasksStore = useTasksStore.getState()
  const toDelete = tasksStore.tasks.filter(t => sameId(String(t.kaizenId ?? ''), String(kaizenId)))
  await Promise.all(toDelete.map(t => tasksStore.deleteTask(t.id)))
}
