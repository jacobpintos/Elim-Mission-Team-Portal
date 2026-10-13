import { create } from 'zustand'
import {
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import type { Repeat } from '@/lib/reminders'

/**
 * Reminders people set for themselves through Miriam ("remind me to go to
 * Costco at 5 pm tomorrow"): theirs alone (firestore.rules), shown in the
 * Tasks tab, and sent as a push at their time (functions: sendDueReminders).
 */
export interface Reminder {
  id: string
  uid: string
  text: string
  /** When, in ms. */
  remindAt: number
  done: boolean
  /** Not sent yet: what sendDueReminders looks for. */
  pending: boolean
  /** How often it comes round, if it does (lib/reminders). */
  repeat?: Repeat
  /** Where it was set: its times are theirs there. */
  tz?: string
  /** Tied to an event ("an hour before Revival"): it moves with it (functions: moveEventReminders). */
  eventKey?: string
  eventTemplateId?: string
  eventTitle?: string
  minutesBefore?: number
  /**
   * Before every one of their events, from now on ("an hour before every
   * event"): one reminder, its time and event always the next of them
   * (functions/src/push/everyEvent). With none coming up, `remindAt` is 0.
   */
  everyEvent?: boolean
  /** One before every event by days: "the day before" 1, "the morning of" 0 — at `atHour`. */
  daysBefore?: number
  atHour?: number
  /** As it was said: "1 hour before", "the morning of". */
  relation?: string
}

/** How long before each event a reminder before every event comes. */
export type BeforeEach = { minutes: number } | { days: number; hour: number }

/** What else a reminder may carry. */
export type ReminderExtra = Pick<
  Reminder,
  'repeat' | 'eventKey' | 'eventTemplateId' | 'eventTitle' | 'minutesBefore'
>

/** How long to wait for the database to have it, before taking it as saved for when there is a signal. */
const SAVE_WAIT_MS = 4000

interface RemindersStore {
  reminders: Reminder[]
  loaded: boolean
  _unsub: (() => void) | null
  _refCount: number
  subscribe: (uid: string) => void
  unsubscribe: () => void
  add: (uid: string, text: string, at: Date, extra?: ReminderExtra) => Promise<string>
  /** One before every event of theirs, from now on; `first`, the next of them, if any. */
  addBeforeEach: (
    uid: string,
    text: string,
    before: BeforeEach,
    relation: string,
    first: { at: Date; eventKey: string; eventTemplateId: string; eventTitle: string } | null
  ) => Promise<string>
  /** Again in a while: "snooze an hour". */
  snooze: (r: Reminder, minutes: number) => Promise<void>
  setDone: (r: Reminder, done: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useRemindersStore = create<RemindersStore>((set, get) => ({
  reminders: [],
  loaded: false,
  _unsub: null,
  _refCount: 0,

  subscribe: (uid) => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    const unsub = onSnapshot(
      query(collection(db, 'reminders'), where('uid', '==', uid)),
      (snap) => {
        const reminders = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Reminder, 'id'>), id: d.id }))
          .sort((a, b) => a.remindAt - b.remindAt)
        set({ reminders, loaded: true })
      },
      () => set({ loaded: true })
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, reminders: [], loaded: false })
    }
  },

  add: async (uid, text, at, extra = {}) => {
    // Its id made here, so it is set even without a signal: saved on the
    // phone at once, and sent as soon as there is one.
    const ref = doc(collection(db, 'reminders'))
    const saved = setDoc(ref, {
      uid,
      text: text.slice(0, 300),
      remindAt: at.getTime(),
      done: false,
      pending: true,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
      createdAt: serverTimestamp(),
    })
    await Promise.race([saved, new Promise((done) => setTimeout(done, SAVE_WAIT_MS))])
    saved.catch(() => {})
    return ref.id
  },

  addBeforeEach: async (uid, text, before, relation, first) => {
    const ref = doc(collection(db, 'reminders'))
    const saved = setDoc(ref, {
      uid,
      text: text.slice(0, 300),
      everyEvent: true,
      ...('minutes' in before
        ? { minutesBefore: before.minutes }
        : { daysBefore: before.days, atHour: before.hour }),
      relation: relation.slice(0, 60),
      // The first of them, worked out here; kept to the next by the server from then on.
      remindAt: first ? first.at.getTime() : 0,
      pending: !!first,
      ...(first
        ? {
            eventKey: first.eventKey,
            eventTemplateId: first.eventTemplateId,
            eventTitle: first.eventTitle,
          }
        : {}),
      done: false,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: serverTimestamp(),
    })
    await Promise.race([saved, new Promise((done) => setTimeout(done, SAVE_WAIT_MS))])
    saved.catch(() => {})
    return ref.id
  },

  setDone: async (r, done) => {
    set((s) => ({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, done } : x)) }))
    // Undone before its time: sent after all.
    await updateDoc(doc(db, 'reminders', r.id), {
      done,
      ...(done ? {} : { pending: r.remindAt > Date.now() }),
    })
  },

  snooze: async (r, minutes) => {
    const remindAt = Date.now() + minutes * 60_000
    set((s) => ({
      reminders: s.reminders.map((x) =>
        x.id === r.id ? { ...x, remindAt, done: false, pending: true } : x
      ),
    }))
    // A repeating one — or one before every event — is snoozed as a one-off
    // copy; it keeps its own times.
    if (r.repeat || r.everyEvent) {
      await setDoc(doc(collection(db, 'reminders')), {
        uid: r.uid,
        text: r.text,
        remindAt,
        done: false,
        pending: true,
        tz: r.tz ?? null,
        createdAt: serverTimestamp(),
      })
      return
    }
    await updateDoc(doc(db, 'reminders', r.id), { remindAt, done: false, pending: true })
  },

  remove: async (id) => {
    set((s) => ({ reminders: s.reminders.filter((x) => x.id !== id) }))
    await deleteDoc(doc(db, 'reminders', id))
  },
}))
