import { create } from 'zustand'
import type { TourStep } from './types'

interface StartOpts {
  title: string
  steps: TourStep[]
  /** Called when the tour ends, whether finished or skipped. */
  onExit?: () => void
}

interface TourStore {
  active: boolean
  title: string
  steps: TourStep[]
  index: number
  _onExit?: () => void

  start: (opts: StartOpts) => void
  next: () => void
  prev: () => void
  goTo: (i: number) => void
  /** Exit the tour (skip or finish) — both run the onExit callback. */
  end: () => void
}

export const useTourStore = create<TourStore>((set, get) => ({
  active: false,
  title: '',
  steps: [],
  index: 0,
  _onExit: undefined,

  start: ({ title, steps, onExit }) => {
    if (!steps.length) return
    set({ active: true, title, steps, index: 0, _onExit: onExit })
  },

  next: () => {
    const { index, steps } = get()
    if (index >= steps.length - 1) {
      get().end()
      return
    }
    set({ index: index + 1 })
  },

  prev: () => {
    const { index } = get()
    if (index <= 0) return
    set({ index: index - 1 })
  },

  goTo: (i) => {
    const { steps } = get()
    if (i < 0 || i >= steps.length) return
    set({ index: i })
  },

  end: () => {
    const onExit = get()._onExit
    set({ active: false, steps: [], index: 0, title: '', _onExit: undefined })
    onExit?.()
  },
}))
