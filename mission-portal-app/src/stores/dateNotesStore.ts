import { create } from 'zustand'
import { deleteField, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { onSnapshot } from '@/lib/liveFirestore'
import { isDay, MAX_DATE_NOTES, noteText, type DateNote } from '@/lib/dateNotes'

/**
 * Each person's own notes on days of their calendar (lib/dateNotes): never
 * anyone else's to see — an admin's included (firestore.rules: dateNotes).
 *
 * One document per person (dateNotes/{uid}), each note a field by its id, as
 * the chord-sheet notes are kept (stores/sheetNotesStore): one listener, one
 * offline copy, and one thing to delete with the account.
 */

interface DateNotesStore {
  notes: DateNote[]
  loaded: boolean
  _uid: string | null
  _unsub: (() => void) | null
  _refCount: number
  subscribe: (uid: string) => void
  unsubscribe: () => void
  /** A new note on a day; its id. */
  add: (date: string, text: string) => Promise<string>
  /** A note's words changed; none, and it is gone. */
  edit: (id: string, text: string) => Promise<void>
  remove: (ids: string[]) => Promise<void>
  /** Notes taken away, put back as they were (Undo). */
  restore: (notes: DateNote[]) => Promise<void>
}

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** A field of the document, as a note — or null, if it isn't one. */
function noteFrom(id: string, v: unknown): DateNote | null {
  const n = v as Partial<DateNote> | null
  if (!n || !isDay(n.date) || typeof n.text !== 'string' || !n.text.trim()) return null
  return { id, date: n.date, text: n.text, at: typeof n.at === 'number' ? n.at : 0 }
}

const sorted = (notes: DateNote[]) =>
  [...notes].sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)

export const useDateNotesStore = create<DateNotesStore>((set, get) => ({
  notes: [],
  loaded: false,
  _uid: null,
  _unsub: null,
  _refCount: 0,

  subscribe: (uid) => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (get()._uid === uid && get()._unsub) return
    get()._unsub?.()
    const unsub = onSnapshot(
      doc(db, 'dateNotes', uid),
      (snap) => {
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>
        const notes = Object.entries(data)
          .map(([id, v]) => noteFrom(id, v))
          .filter((n): n is DateNote => !!n)
        set({ notes: sorted(notes), loaded: true })
      },
      (err) => {
        console.error('[DateNotesStore] onSnapshot error:', err.code, err.message)
        set({ loaded: true })
      }
    )
    set({ _uid: uid, _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, _uid: null, notes: [], loaded: false })
    }
  },

  // Shown at once, and written behind: offline, the write waits for signal
  // while the note is already on the calendar.
  add: async (date, text) => {
    const uid = get()._uid
    const words = noteText(text)
    if (!uid) throw new Error('not signed in')
    if (!isDay(date) || !words) throw new Error('nothing to note')
    if (get().notes.length >= MAX_DATE_NOTES) throw new Error('full')
    const note: DateNote = { id: newId(), date, text: words, at: Date.now() }
    set({ notes: sorted([...get().notes, note]) })
    const saved = setDoc(
      doc(db, 'dateNotes', uid),
      { [note.id]: { date: note.date, text: note.text, at: note.at } },
      { merge: true }
    )
    // Not waited on past a moment: with no signal it is kept on the phone and sent when there is one.
    await Promise.race([saved, new Promise((done) => setTimeout(done, 4000))])
    saved.catch(() => {})
    return note.id
  },

  edit: async (id, text) => {
    const uid = get()._uid
    if (!uid) return
    const words = noteText(text)
    if (!words) return get().remove([id])
    const before = get().notes.find((n) => n.id === id)
    if (!before) return
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, text: words } : n)) })
    await setDoc(
      doc(db, 'dateNotes', uid),
      { [id]: { date: before.date, text: words, at: before.at } },
      { merge: true }
    )
  },

  remove: async (ids) => {
    const uid = get()._uid
    if (!uid || ids.length === 0) return
    set({ notes: get().notes.filter((n) => !ids.includes(n.id)) })
    await setDoc(
      doc(db, 'dateNotes', uid),
      Object.fromEntries(ids.map((id) => [id, deleteField()])),
      { merge: true }
    )
  },

  restore: async (notes) => {
    const uid = get()._uid
    if (!uid || notes.length === 0) return
    const kept = new Set(get().notes.map((n) => n.id))
    set({ notes: sorted([...get().notes, ...notes.filter((n) => !kept.has(n.id))]) })
    await setDoc(
      doc(db, 'dateNotes', uid),
      Object.fromEntries(notes.map((n) => [n.id, { date: n.date, text: n.text, at: n.at }])),
      { merge: true }
    )
  },
}))
