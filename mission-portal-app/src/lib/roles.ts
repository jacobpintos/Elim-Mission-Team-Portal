import type { Role, UserProfile } from '@/types/user'

export const hasRole = (u: UserProfile | null, r: Role) => !!u?.roles?.includes(r)
export const isAdmin = (u: UserProfile | null) => hasRole(u, 'admin')
export const isSecurity = (u: UserProfile | null) => hasRole(u, 'security') || isAdmin(u)
export const isWorship = (u: UserProfile | null) => hasRole(u, 'worship') || isAdmin(u)
export const isMerch = (u: UserProfile | null) => hasRole(u, 'merch') || isAdmin(u)
export const isVerified = (u: UserProfile | null) => !!u && !hasRole(u, 'unverified')
export const isPublic = (u: UserProfile | null) => hasRole(u, 'public')

// Phase 3 nav visibility helpers
export const canSeeSecurity = (u: UserProfile | null) =>
  !u ? false : isAdmin(u) || hasRole(u, 'security') || hasRole(u, 'staff' as Role)
export const canSeeWorship = (u: UserProfile | null) =>
  !u ? false : isAdmin(u) || hasRole(u, 'worship')
export const canSeeMerch = (u: UserProfile | null) =>
  !u ? false : isAdmin(u) || hasRole(u, 'merch')

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
  // All authenticated users get: home, events, messages, posts, music, announce
  const tabs: Tab[] = ['home', 'events', 'messages', 'music', 'announce', 'posts']
  if (!isPublic(u)) tabs.unshift('dashboard')
  if (!isPublic(u)) tabs.push('assignments', 'issues')
  if (canSeeSecurity(u)) tabs.push('security')
  if (canSeeWorship(u)) tabs.push('worship')
  if (canSeeMerch(u) && !isAdmin(u)) tabs.push('inventory')
  if (isAdmin(u)) tabs.push('inventory', 'admin')
  return tabs
}
