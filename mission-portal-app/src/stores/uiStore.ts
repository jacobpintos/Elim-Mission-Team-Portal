import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
}

interface UIStore {
  toasts: Toast[]
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void
  dismissToast: (id: string) => void
  saving: boolean
  setSaving: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  toasts: [],
  toast: (message, kind = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  saving: false,
  setSaving: (v) => set({ saving: v }),
}))
