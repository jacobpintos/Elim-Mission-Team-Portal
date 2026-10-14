import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { EventDraft, TaskDraft } from '@/lib/miriam'
import { withExchange, type Exchange } from '@/lib/miriamConversation'
import type { MeetingAsk } from '@/lib/miriamMeeting'

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
  /**
   * A question heard elsewhere ("Hey Miriam, what's the dress code?" said to
   * an open chord sheet, which only knows songs), for Miriam to answer.
   */
  handed: { id: number; text: string } | null
  hand: (text: string) => void
  clearHanded: () => void
  /** "Hey Miriam" switched on, on this device: listened for wherever it can be. */
  wakeOn: boolean
  setWakeOn: (on: boolean) => void
  /** Switched on or off, and kept that way on this device. */
  saveWakeOn: (on: boolean) => void
  eventForm: PendingEventForm | null
  offerEventForm: (form: Omit<PendingEventForm, 'id'>) => void
  clearEventForm: () => void
  userForm: PendingUserForm | null
  taskForm: { id: number; draft: TaskDraft; notes: string[] } | null
  offerTaskForm: (form: { draft: TaskDraft; notes: string[] }) => void
  clearTaskForm: () => void
  offerUserForm: (form: Omit<PendingUserForm, 'id'>) => void
  clearUserForm: () => void
  /**
   * The Connect page's meeting form, filled in from what was said, for its
   * form to take (page-builder MeetingBlock) — and for them to send themselves.
   */
  meetingForm: (MeetingAsk & { id: number }) | null
  offerMeetingForm: (form: MeetingAsk) => void
  clearMeetingForm: () => void
  /** What was said and answered lately (lib/miriamConversation). */
  conversation: Exchange[]
  remember: (said: string, reply: string) => void
  /** She asked something back, and what is said next answers it. */
  awaiting: boolean
  setAwaiting: (awaiting: boolean) => void
}

/** Where "Hey Miriam" on or off is kept, on this device. */
export const WAKE_KEY = 'miriam_wake'

export const useMiriamStore = create<MiriamStore>((set) => ({
  handed: null,
  hand: (text) => set({ handed: { id: Date.now(), text } }),
  clearHanded: () => set({ handed: null }),
  wakeOn: false,
  setWakeOn: (wakeOn) => set({ wakeOn }),
  saveWakeOn: (wakeOn) => {
    set({ wakeOn })
    AsyncStorage.setItem(WAKE_KEY, wakeOn ? '1' : '0').catch(() => {})
  },
  eventForm: null,
  offerEventForm: (form) => set({ eventForm: { ...form, id: Date.now() } }),
  clearEventForm: () => set({ eventForm: null }),
  userForm: null,
  taskForm: null,
  offerTaskForm: (form) => set({ taskForm: { ...form, id: Date.now() } }),
  clearTaskForm: () => set({ taskForm: null }),
  offerUserForm: (form) => set({ userForm: { ...form, id: Date.now() } }),
  clearUserForm: () => set({ userForm: null }),
  meetingForm: null,
  offerMeetingForm: (form) => set({ meetingForm: { ...form, id: Date.now() } }),
  clearMeetingForm: () => set({ meetingForm: null }),
  conversation: [],
  remember: (said, reply) =>
    set((s) =>
      said.trim() && reply.trim()
        ? { conversation: withExchange(s.conversation, { said, reply, at: Date.now() }) }
        : s
    ),
  awaiting: false,
  setAwaiting: (awaiting) => set({ awaiting }),
}))
