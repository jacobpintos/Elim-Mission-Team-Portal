import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { nextId } from '@/lib/counters'
import { sameId } from '@/lib/ids'
import { useTasksStore } from '@/stores/tasksStore'
import { sendMessageAs } from '@/stores/messagesStore'
import type {
  KaizenCard,
  KaizenStatus,
  KaizenActionPlan,
  KaizenVerificationResult,
  KaizenActionTask,
} from '@/types/operations'
import type { InAppNotif } from '@/types/events'

async function notifyUser(uid: string, notif: InAppNotif) {
  await setDoc(doc(db, 'notifs', uid), { items: arrayUnion(notif) }, { merge: true })
}

interface KaizenStore {
  cards: KaizenCard[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  addCard: (data: {
    title: string
    description: string
    createdBy: string | number
  }) => Promise<void>
  moveCard: (id: string | number, to: KaizenStatus) => Promise<void>
  toggleUpvote: (id: string | number, uid: string | number) => Promise<void>
  saveActionPlan: (
    id: string | number,
    plan: Omit<KaizenActionPlan, 'verificationTaskId'>
  ) => Promise<void>
  submitVerification: (
    id: string | number,
    result: Omit<KaizenVerificationResult, 'completedAt'>,
    taskId: string | number
  ) => Promise<void>
  deleteCard: (id: string | number, reason: string, deletedBy: string | number) => Promise<void>
  prerequisitesMet: (id: string | number) => { ok: boolean; message?: string }
}

export const useKaizenStore = create<KaizenStore>((set, get) => ({
  cards: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'kaizen'), (snap) => {
      const cards = snap.docs.map((d) => ({ ...(d.data() as KaizenCard), id: d.id }))
      set({ cards, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, cards: [] })
  },

  addCard: async (data) => {
    const id = await nextId('nKaizen')
    await setDoc(doc(db, 'kaizen', String(id)), {
      ...data,
      id,
      status: 'idea' as KaizenStatus,
      upvotes: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },

  moveCard: async (id, to) => {
    await updateDoc(doc(db, 'kaizen', String(id)), {
      status: to,
      updatedAt: serverTimestamp(),
    })
  },

  toggleUpvote: async (id, uid) => {
    const card = get().cards.find((c) => sameId(c.id, id))
    if (!card) return
    const hasVoted = card.upvotes.some((u) => sameId(u, uid))
    const upvotes = hasVoted
      ? card.upvotes.filter((u) => !sameId(u, uid))
      : [...card.upvotes, uid]
    set((s) => ({
      cards: s.cards.map((c) => (sameId(c.id, id) ? { ...c, upvotes } : c)),
    }))
    await updateDoc(doc(db, 'kaizen', String(id)), {
      upvotes,
      updatedAt: serverTimestamp(),
    })
  },

  saveActionPlan: async (id, plan) => {
    const card = get().cards.find((c) => sameId(c.id, id))
    if (!card) return
    const tasksStore = useTasksStore.getState()

    const tasksWithIds: KaizenActionTask[] = []
    for (const t of plan.tasks) {
      const taskId = await tasksStore.createTask({
        title: `[Kaizen] ${t.description}`,
        assignees: [t.assignee],
        lead: null,
        by: plan.createdBy,
        status: 'pending',
        dueDate: t.dueDate,
        taskType: 'kaizen_action',
        kaizenId: id,
      })
      tasksWithIds.push({ ...t, taskId })
    }

    const verificationTaskId = await tasksStore.createTask({
      title: `[Kaizen] Verify: ${card.title}`,
      assignees: [plan.verifierId],
      lead: null,
      by: plan.createdBy,
      status: 'pending',
      dueDate: plan.reviewDate,
      taskType: 'kaizen_verification',
      kaizenId: id,
    })

    const fullPlan: KaizenActionPlan = {
      ...plan,
      tasks: tasksWithIds,
      verificationTaskId,
    }

    await updateDoc(doc(db, 'kaizen', String(id)), {
      status: 'implementation' as KaizenStatus,
      actionPlan: fullPlan,
      updatedAt: serverTimestamp(),
    })

    // Notify everyone who just picked up work from this action plan.
    const sendNotif = httpsCallable(functions, 'sendNotification')
    for (const t of tasksWithIds) {
      sendNotif({
        uid: String(t.assignee),
        type: 'newAssignment',
        data: { taskTitle: `[Kaizen] ${t.description}`, taskId: String(t.taskId) },
      }).catch(() => {})
    }
    sendNotif({
      uid: String(plan.verifierId),
      type: 'newAssignment',
      data: {
        taskTitle: `[Kaizen] Verify: ${card.title}`,
        taskId: String(verificationTaskId),
      },
    }).catch(() => {})
  },

  submitVerification: async (id, result, taskId) => {
    const card = get().cards.find((c) => sameId(c.id, id))
    if (!card?.actionPlan) return

    const fullResult: KaizenVerificationResult = {
      ...result,
      completedAt: serverTimestamp(),
    }

    await useTasksStore.getState().completeTask(taskId)

    await updateDoc(doc(db, 'kaizen', String(id)), {
      'actionPlan.verificationResult': fullResult,
      updatedAt: serverTimestamp(),
    })

    const adminUid = String(card.actionPlan.createdBy)
    const notif: InAppNotif = {
      id: `kz_verify_${id}_${Date.now()}`,
      msg: `CA verification completed for "${card.title}" — ${result.effectiveness.replace(/_/g, ' ')}`,
      ts: Date.now(),
      type: 'kaizen_verification',
      read: false,
    }
    await notifyUser(adminUid, notif)
  },

  deleteCard: async (id, reason, deletedBy) => {
    const card = get().cards.find((c) => sameId(c.id, id))
    if (!card) return

    // Build unique member list: deleter + creator + all upvoters
    const memberSet = new Set([
      String(deletedBy),
      String(card.createdBy),
      ...card.upvotes.map(String),
    ])
    const members = [...memberSet]

    // Create a group room so the message appears in everyone's Messages tab
    const roomId = await nextId('nRoom')
    const roomName = `Kaizen Deletion: ${card.title}`
    await setDoc(doc(db, 'rooms', String(roomId)), {
      id: roomId,
      name: roomName,
      members,
      call: false,
      reviewers: [],
      updatedAt: serverTimestamp(),
    })

    const msgText =
      `The kaizen card "${card.title}" has been deleted.\n\nReason: ${reason}`
    await sendMessageAs(roomId, String(deletedBy), msgText)

    await deleteDoc(doc(db, 'kaizen', String(id)))
  },

  prerequisitesMet: (id) => {
    const card = get().cards.find((c) => sameId(c.id, id))
    if (!card?.actionPlan) return { ok: false, message: 'No action plan has been created yet' }

    const allTasks = useTasksStore.getState().tasks

    for (const t of card.actionPlan.tasks) {
      if (!t.taskId) continue
      const task = allTasks.find((at) => sameId(at.id, t.taskId!))
      if (!task || task.status !== 'done') {
        return { ok: false, message: 'Not all action tasks are completed' }
      }
    }

    if (!card.actionPlan.verificationTaskId) {
      return { ok: false, message: 'Verification task not assigned' }
    }
    const verifyTask = allTasks.find((t) => sameId(t.id, card.actionPlan!.verificationTaskId!))
    if (!verifyTask || verifyTask.status !== 'done') {
      return { ok: false, message: 'CA verification has not been completed' }
    }

    return { ok: true }
  },
}))
