import type { Role, UserProfile } from '@/types/user'

export const hasRole = (u: UserProfile | null, r: Role) => !!u?.roles?.includes(r)
export const isAdmin = (u: UserProfile | null) => hasRole(u, 'admin')
export const isSecurity = (u: UserProfile | null) => hasRole(u, 'security') || isAdmin(u)
export const isWorship = (u: UserProfile | null) => hasRole(u, 'worship') || isAdmin(u)
export const isMerch = (u: UserProfile | null) => hasRole(u, 'merch') || isAdmin(u)
export const isPublic = (u: UserProfile | null) => hasRole(u, 'public')
export const isIntern = (u: UserProfile | null) => hasRole(u, 'intern')

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
  if (!u) return []

  const MEMBER_ROLES: Role[] = ['admin', 'security', 'regular', 'intern', 'merch', 'worship']
  const isMember = u.roles?.some((r) => MEMBER_ROLES.includes(r)) ?? false

  // Users with no member role get public-facing tabs only
  if (!isMember)
    return ['home', 'events', 'announce', 'connect', 'music', 'giving', 'story', 'posts', 'settings']

  if (isAdmin(u)) {
    return [
      'dashboard', 'events', 'assignments', 'messages', 'announce', 'issues',
      'security', 'worship', 'rolehub', 'public', 'settings',
    ]
  }

  // Intern: public base + assignments + operations + specialty tabs. No dashboard or messages.
  if (isIntern(u) && !hasRole(u, 'regular')) {
    const tabs: Tab[] = [
      'home', 'events', 'assignments', 'announce', 'issues',
      'connect', 'music', 'giving', 'story', 'posts', 'settings',
    ]
    if (hasRole(u, 'worship')) tabs.splice(tabs.indexOf('issues') + 1, 0, 'worship')
    if (hasRole(u, 'security')) tabs.splice(1, 0, 'security')
    if (hasRole(u, 'merch')) tabs.push('inventory')
    return tabs
  }

  // Regular and specialty members
  const tabs: Tab[] = ['dashboard', 'events', 'assignments', 'messages', 'announce', 'issues']

  if (isWorship(u)) tabs.push('worship')
  if (isSecurity(u)) tabs.push('security')
  if (isMerch(u)) tabs.push('inventory')

  tabs.push('public', 'settings')
  return tabs
}

// TEMPORARY DIAGNOSTIC MARKER — see index.js.
;(globalThis as any).__diag_rolesLoaded = true
