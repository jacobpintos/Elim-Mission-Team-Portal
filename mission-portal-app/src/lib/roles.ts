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

export function visibleTabs(u: UserProfile | null): Tab[] {
  if (!u || !isVerified(u)) return []

  // Public (guest) role: read-only view of public content
  if (isPublic(u)) return ['home', 'events', 'messages', 'music']

  // Admin sees everything in a specific order matching the original design
  if (isAdmin(u)) {
    return [
      'dashboard',
      'events',
      'messages',
      'announce',
      'assignments',
      'admin',
      'issues',      // rendered as "Operations"
      'security',
      'inventory',
      'worship',
      'music',       // Content: music, podcasts, sermons (YouTube embeds)
      'public',      // Public Facing: Posts, Connect, Giving, Our Story
    ]
  }

  // Regular verified team members — music visible to all
  const tabs: Tab[] = ['home', 'events', 'messages', 'announce', 'assignments', 'issues', 'music']
  if (isSecurity(u)) tabs.push('security')
  if (isMerch(u)) tabs.push('inventory')
  if (isWorship(u)) tabs.push('worship')
  return tabs
}
