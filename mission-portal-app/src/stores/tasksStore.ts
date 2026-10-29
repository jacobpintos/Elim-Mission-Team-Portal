import { create } from 'zustand'
import {
  collection,
  doc,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { isOverdue } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { nextId } from '@/lib/counters'
import { isAdmin } from '@/lib/roles'
import { useAuthStore } from '@/stores/authStore'
import type { Task } from '@/types/events'
import { readers } from '@/lib/seenBy'
import { taskSeenBy } from '../../functions/src/recordAccess'

const todayStr = () => new Date().toISOString().split('T')[0]
const in7 = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

const isAssigned = (t: Task, uid: string) => t.assignees.some((a) => sameId(a, uid))

interface TasksStore {
  tasks: Task[]
  loading: boolean
  _unsub: (() => void) | null
  _unsubAuth: (() => void) | null
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
  _unsubAuth: null,
  _refCount: 0,

  myTasks: (uid) => {
    const today = todayStr()
    return get().tasks.filter((t) => {
      // A task done for someone (a reimbursement they asked for) is on their
      // list as well as its assignees', so they can follow it.
      if (!t.assignees.some((a) => sameId(a, uid)) && !(t.owner && sameId(t.owner, uid)))
        return false
      // Hide pre-event tasks for past events only if they're already done
      if (t.evDate && !t.isPostEvent && t.evDate < today && !!t.doneAt) return false
      return true
    })
  },
  eventTasks: (templateId) =>
    get().tasks.filter((t) => sameId(t.evId ?? t.evTemplateId, templateId)),
  // These three are work the person has to do, so a task they only follow
  // (one done for them) is left out: someone waiting to be reimbursed has
  // nothing overdue of their own when the payment is late.
  overdueTasks: (uid) =>
    get()
      .myTasks(uid)
      .filter((t) => isOverdue(t) && isAssigned(t, uid)),
  behindTasks: (uid) =>
    get()
      .myTasks(uid)
      .filter((t) => t.status === 'behind' && isAssigned(t, uid)),
  dueThisWeekTasks: (uid) => {
    const today = todayStr()
    const end = in7()
    return get()
      .myTasks(uid)
      .filter(
        (t) =>
          isAssigned(t, uid) &&
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
    // The tasks this person may read: their own, and — an admin — every
    // one but a reimbursement's (functions/src/recordAccess taskSeenBy).
    // Listened to as whoever is signed in, and again if that, or their
    // roles, change.
    let listeningAs: string | null = null
    const listen = () => {
      const profile = useAuthStore.getState().profile
      const as = profile ? `${profile.uid}|${isAdmin(profile)}` : ''
      if (as === listeningAs) return
      listeningAs = as
      get()._unsub?.()
      set({ _unsub: null, tasks: [] })
      if (!profile?.uid) return set({ loading: false })
      // Asked for as the rules allow (firestore.rules tasks): asked for all,
      // anyone is refused.
      const mine = query(
        collection(db, 'tasks'),
        where('seenBy', 'array-contains-any', readers(profile))
      )
      const unsub = onSnapshot(
        mine,
        (snap) => {
          const tasks = snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }))
          set({ tasks, loading: false })
        },
        (err) => {
          console.error('[TasksStore]', err.code, err.message)
          set({ loading: false })
        }
      )
      set({ _unsub: unsub })
    }
    listen()
    set({ _unsubAuth: useAuthStore.subscribe(listen) })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      get()._unsubAuth?.()
      set({ _unsub: null, _unsubAuth: null, tasks: [] })
    }
  },

  createTask: async (data) => {
    const id = await nextId('nTask')
    await setDoc(doc(db, 'tasks', String(id)), {
      ...data,
      id,
      // Who may read it (firestore.rules tasks).
      seenBy: taskSeenBy(data),
      _updatedAt: serverTimestamp(),
    })
    return id
  },

  updateTask: async (id, patch) => {
    const was = get().tasks.find((t) => sameId(t.id, id))
    // Handed to someone else: who may read it goes with it.
    const handed = ['assignees', 'lead', 'owner', 'taskType'].some((k) => k in patch)
    const seenBy = handed && was ? { seenBy: taskSeenBy({ ...was, ...patch }) } : {}
    set((s) => ({
      tasks: s.tasks.map((t) => (sameId(t.id, id) ? { ...t, ...patch } : t)),
    }))
    await updateDoc(doc(db, 'tasks', String(id)), {
      ...patch,
      ...seenBy,
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
