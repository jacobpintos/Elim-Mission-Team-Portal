import { create } from 'zustand'

type PageKey = 'ourstory' | 'connect' | 'giving'

interface PageBuilderStore {
  buildModeKey: PageKey | null
  setBuildMode: (key: PageKey | null) => void
}

export const usePageBuilderStore = create<PageBuilderStore>((set) => ({
  buildModeKey: null,
  setBuildMode: (key) => set({ buildModeKey: key }),
}))
