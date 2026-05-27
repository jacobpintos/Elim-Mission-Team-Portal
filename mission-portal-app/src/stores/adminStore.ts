import { create } from 'zustand'

export type AdminTab = 'users' | 'groups' | 'teams' | 'templates' | 'leadership' | 'audit' | 'deletions'

interface AdminStore {
  activeTab: AdminTab
  setActiveTab: (tab: AdminTab) => void
  auditPage: number
  auditSearch: string
  setAuditPage: (page: number) => void
  setAuditSearch: (q: string) => void
}

export const useAdminStore = create<AdminStore>((set) => ({
  activeTab: 'users',
  setActiveTab: (tab) => set({ activeTab: tab }),
  auditPage: 0,
  auditSearch: '',
  setAuditPage: (page) => set({ auditPage: page }),
  setAuditSearch: (q) => set({ auditSearch: q, auditPage: 0 }),
}))
