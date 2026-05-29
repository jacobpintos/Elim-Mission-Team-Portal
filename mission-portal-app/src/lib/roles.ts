import type { Role, UserProfile } from '@/types/user'

export const hasRole = (u: UserProfile | null, r: Role) => !!u?.roles?.includes(r)
export const isAdmin = (u: UserProfile | null) => hasRole(u, 'admin')
export const isSecurity = (u: UserProfile | null) => hasRole(u, 'security') || isAdmin(u)
export const isWorship = (u: UserProfile | null) => hasRole(u, 'worship') || isAdmin(u)
export const isMerch = (u: UserProfile | null) => hasRole(u, 'merch') || isAdmin(u)
export const isVerified = (u: UserProfile | null) => !!u && !hasRole(u, 'unverified')
export const isPublic = (u: UserProfile | null) => hasRole(u, 'public')

export type Tab =
  | 'dashboard'
  | 'home'
  | 'events'
  | 'assignments'
  | 'messages'
  | 'issues'
  | 'security'
  | 'inventory'
  | 'announce'
  | 'worship'
  | 'music'
  | 'posts'
  | 'admin'

export function visibleTabs(u: UserProfile | null): Tab[] {
  if (!u || !isVerified(u)) return []
  const tabs: Tab[] = ['home', 'events', 'messages', 'posts']
  if (!isPublic(u)) tabs.unshift('dashboard')
  if (!isPublic(u)) tabs.push('assignments')
  if (isAdmin(u)) tabs.push('admin')
  return tabs
}
