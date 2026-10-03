import { create } from 'zustand'
import { deleteField, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { onSnapshot } from '@/lib/liveFirestore'

/**
 * Each person's own notes on chord sheets: one for the song ("capo 2, count
 * in 4") and one per section ("acoustic only", "×3, drop the second to
 * keys"). Never part of the chart — nobody else sees them, and they stay put
 * through a change of key, numbers, Chords Only or text size.
 *
 * One document per person (sheetNotes/{uid}), keyed by sheet, then section:
 * a person's notes on every song are a few kilobytes, and one document is
 * one listener, one offline copy and one thing to delete with the account.
 */

export interface SheetNotes {
  song?: string
  sections?: Record<string, string>
}

/** A note's longest — a note, not a chart. */
export const NOTE_MAX = 300

interface SheetNotesStore {
  notes: Record<string, SheetNotes>
  _uid: string | null
  _unsub: (() => void) | null
  _refCount: number
  subscribe: (uid: string) => void
  unsubscribe: () => void
  setSongNote: (sheetId: string, text: string) => Promise<void>
  setSectionNote: (sheetId: string, sectionId: string, text: string) => Promise<void>
}

const clean = (text: string) => text.trim().slice(0, NOTE_MAX)

export const useSheetNotesStore = create<SheetNotesStore>((set, get) => ({
  notes: {},
  _uid: null,
  _unsub: null,
  _refCount: 0,

  subscribe: (uid) => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (get()._uid === uid && get()._unsub) return
    get()._unsub?.()
    const unsub = onSnapshot(
      doc(db, 'sheetNotes', uid),
      (snap) => {
        set({ notes: (snap.exists() ? snap.data() : {}) as Record<string, SheetNotes> })
      },
      (err) => {
        console.error('[SheetNotesStore] onSnapshot error:', err.code, err.message)
      }
    )
    set({ _uid: uid, _unsub: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsub?.()
      set({ _unsub: null, _uid: null, notes: {} })
    }
  },

  // Shown at once, and written behind: offline, the write waits for signal
  // while the note is already on the sheet.
  setSongNote: async (sheetId, text) => {
    const uid = get()._uid
    if (!uid) return
    const note = clean(text)
    const current = get().notes[sheetId] ?? {}
    set({ notes: { ...get().notes, [sheetId]: { ...current, song: note || undefined } } })
    await setDoc(
      doc(db, 'sheetNotes', uid),
      { [sheetId]: { song: note || deleteField() } },
      { merge: true }
    )
  },

  setSectionNote: async (sheetId, sectionId, text) => {
    const uid = get()._uid
    if (!uid) return
    const note = clean(text)
    const current = get().notes[sheetId] ?? {}
    const sections = { ...(current.sections ?? {}) }
    if (note) sections[sectionId] = note
    else delete sections[sectionId]
    set({ notes: { ...get().notes, [sheetId]: { ...current, sections } } })
    await setDoc(
      doc(db, 'sheetNotes', uid),
      { [sheetId]: { sections: { [sectionId]: note || deleteField() } } },
      { merge: true }
    )
  },
}))
