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
  | 'admin'
  | 'public'
  | 'music'
  | 'posts'
  | 'giving'
  | 'story'
  | 'connect'
  | 'rolehub'
  | 'settings'

export function visibleTabs(u: UserProfile | null): Tab[] {
  if (!u || !isVerified(u)) return []

  // Public (guest) role — flat individual tabs
  if (isPublic(u)) return ['home', 'events', 'announce', 'connect', 'music', 'giving', 'story', 'posts', 'settings']

  // Admin — all tools, role-specific grouped under rolehub
  if (isAdmin(u)) {
    return ['dashboard', 'events', 'assignments', 'messages', 'announce', 'issues', 'security', 'rolehub', 'public', 'settings']
  }

  // All other verified members share these base tabs
  const tabs: Tab[] = ['dashboard', 'events', 'assignments', 'messages', 'announce', 'issues']

  if (isWorship(u)) tabs.push('worship')
  if (isSecurity(u)) tabs.push('security')
  if (isMerch(u)) tabs.push('inventory')

  tabs.push('public', 'settings')
  return tabs
}
