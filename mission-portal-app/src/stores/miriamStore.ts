import { create } from 'zustand'
import type { EventDraft, TaskDraft } from '@/lib/miriam'

/**
 * What Miriam has filled in, waiting for the screen it belongs on to open it.
 *
 * Miriam is reached from every screen, and the form she fills in lives on
 * one: she leaves it here, goes there, and that screen takes it.
 */
export interface PendingEventForm {
  /** Each new one opens afresh, even with the same details. */
  id: number
  draft: EventDraft
  /** What was asked, to show above the form. */
  heard: string
  /** Things to tell the person, e.g. names that matched nobody. */
  notes: string[]
  /** An existing event's instance key: its form, with the draft's changes made. */
  editKey?: string
}

/** A new account's form, filled in by Miriam, for an admin to give a password and save. */
export interface PendingUserForm {
  id: number
  name: string
  email: string
  roles: string[]
}

interface MiriamStore {
  eventForm: PendingEventForm | null
  offerEventForm: (form: Omit<PendingEventForm, 'id'>) => void
  clearEventForm: () => void
  userForm: PendingUserForm | null
  taskForm: { id: number; draft: TaskDraft; notes: string[] } | null
  offerTaskForm: (form: { draft: TaskDraft; notes: string[] }) => void
  clearTaskForm: () => void
  offerUserForm: (form: Omit<PendingUserForm, 'id'>) => void
  clearUserForm: () => void
}

export const useMiriamStore = create<MiriamStore>((set) => ({
  eventForm: null,
  offerEventForm: (form) => set({ eventForm: { ...form, id: Date.now() } }),
  clearEventForm: () => set({ eventForm: null }),
  userForm: null,
  taskForm: null,
  offerTaskForm: (form) => set({ taskForm: { ...form, id: Date.now() } }),
  clearTaskForm: () => set({ taskForm: null }),
  offerUserForm: (form) => set({ userForm: { ...form, id: Date.now() } }),
  clearUserForm: () => set({ userForm: null }),
}))
