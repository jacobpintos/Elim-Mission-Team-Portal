import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isOverdue } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { nextId } from '@/lib/counters'
import type { Task } from '@/types/events'

const todayStr = () => new Date().toISOString().split('T')[0]
const in7 = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

interface TasksStore {
  tasks: Task[]
  loading: boolean
  _unsub: (() => void) | null
  _refCount: number
  // selectors
  myTasks: (uid: string) => Task[]
  eventTasks: (templateId: string | number) => Task[]
  overdueTasks: (uid: string) => Task[]
  behindTasks: (uid: string) => Task[]
  dueThisWeekTasks: (uid: string) => Task[]
  // actions
  subscribe: () => void
  unsubscribe: () => void
  createTask: (data: Omit<Task, 'id'>) => Promise<string | number>
  updateTask: (id: string | number, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string | number) => Promise<void>
  completeTask: (id: string | number) => Promise<void>
  setStatus: (id: string | number, status: Task['status']) => Promise<void>
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  tasks: [],
  loading: false,
  _unsub: null,
  _refCount: 0,

  myTasks: (uid) => {
    const today = todayStr()
    return get().tasks.filter((t) => {
      if (!t.assignees.some((a) => sameId(a, uid))) return false
      // Hide pre-event tasks for past events only if they're already done
      if (t.evDate && !t.isPostEvent && t.evDate < today && !!t.doneAt) return false
      return true
    })
  },
  eventTasks: (templateId) =>
    get().tasks.filter((t) => sameId(t.evId ?? t.evTemplateId, templateId)),
  overdueTasks: (uid) =>
    get()
      .myTasks(uid)
      .filter((t) => isOverdue(t)),
  behindTasks: (uid) =>
    get()
      .myTasks(uid)
      .filter((t) => t.status === 'behind'),
  dueThisWeekTasks: (uid) => {
    const today = todayStr()
    const end = in7()
    return get()
      .myTasks(uid)
      .filter(
        (t) =>
          (t.status === 'pending' || t.status === 'in_progress') &&
          t.dueDate != null &&
          t.dueDate >= today &&
          t.dueDate <= end
      )
  },

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'tasks'), (snap) => {
      const tasks = snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }))
      set({ tasks, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, tasks: [] })
    }
  },

  createTask: async (data) => {
    const id = await nextId('nTask')
    await setDoc(doc(db, 'tasks', String(id)), {
      ...data,
      id,
      _updatedAt: serverTimestamp(),
    })
    return id
  },

  updateTask: async (id, patch) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (sameId(t.id, id) ? { ...t, ...patch } : t)),
    }))
    await updateDoc(doc(db, 'tasks', String(id)), {
      ...patch,
      _updatedAt: serverTimestamp(),
    })
  },

  deleteTask: async (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => !sameId(t.id, id)) }))
    await deleteDoc(doc(db, 'tasks', String(id)))
  },

  completeTask: async (id) => {
    await get().setStatus(id, 'done')
  },

  setStatus: async (id, status) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (sameId(t.id, id) ? { ...t, status } : t)),
    }))
    const extra = status === 'done' ? { doneAt: serverTimestamp() } : {}
    await updateDoc(doc(db, 'tasks', String(id)), {
      status,
      ...extra,
      _updatedAt: serverTimestamp(),
    })
  },
}))
