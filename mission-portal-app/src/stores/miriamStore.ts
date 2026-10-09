import { create } from 'zustand'
import type { EventDraft } from '@/lib/miriam'

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
}

interface MiriamStore {
  eventForm: PendingEventForm | null
  offerEventForm: (form: Omit<PendingEventForm, 'id'>) => void
  clearEventForm: () => void
}

export const useMiriamStore = create<MiriamStore>((set) => ({
  eventForm: null,
  offerEventForm: (form) => set({ eventForm: { ...form, id: Date.now() } }),
  clearEventForm: () => set({ eventForm: null }),
}))
