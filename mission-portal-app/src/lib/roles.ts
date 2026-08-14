import type { Role, UserProfile } from '@/types/user'
import { PUBLIC_SURFACE_ENABLED, PUBLIC_REPLACEMENT_TAB, isTabVisible } from '@/lib/featureFlags'

export const hasRole = (u: UserProfile | null, r: Role) => !!u?.roles?.includes(r)
export const isAdmin = (u: UserProfile | null) => hasRole(u, 'admin')
export const isSecurity = (u: UserProfile | null) => hasRole(u, 'security') || isAdmin(u)
export const isWorship = (u: UserProfile | null) => hasRole(u, 'worship') || isAdmin(u)
export const isPublic = (u: UserProfile | null) => hasRole(u, 'public')
export const isIntern = (u: UserProfile | null) => hasRole(u, 'intern')

/**
 * A guest: someone brought along for a specific trip.
 *
 * Guests hold no member role, so every permission check that asks "is this a
 * member" answers no and they are treated exactly like a public user. What
 * they get on top is reach — they can be added to events, message rooms and
 * set lists individually — and everything they reach is read-only.
 */
export const isGuest = (u: UserProfile | null) => hasRole(u, 'guest')

/** Guests may read what they have been added to, but never change it. */
export const isReadOnly = (u: UserProfile | null) => isGuest(u) && !isAdmin(u)

/**
 * Roles that no longer exist, and what a user carrying one becomes.
 *
 * 'merch' was removed as a user type. A profile that still lists it keeps
 * whatever else it has; if that leaves nothing, it falls back to 'regular' so
 * the account does not silently drop to public-only access.
 */
const RETIRED_ROLES = ['merch']

/**
 * Drop retired roles from a stored profile, keeping the account a member.
 *
 * Returns null when there is nothing to change, so callers can skip the write.
 */
export function migrateRetiredRoles(roles: string[] | undefined): Role[] | null {
  if (!roles?.some((r) => RETIRED_ROLES.includes(r))) return null
  const kept = roles.filter((r) => !RETIRED_ROLES.includes(r)) as Role[]
  return kept.length > 0 ? kept : ['regular']
}

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

/** Roles that make an account a team member rather than a public follower. */
const MEMBER_ROLES: Role[] = ['admin', 'security', 'regular', 'intern', 'worship']

/**
 * Can this user reach direct messages?
 *
 * Announcements and messages share one tab for people who have both, so
 * whether messages exist for a user is now asked separately from what goes in
 * the drawer. Interns and public users get announcements only; everyone else
 * with an account that can be messaged gets the pair.
 */
export function canUseMessages(u: UserProfile | null): boolean {
  if (!u) return false
  const isMember = u.roles?.some((r) => MEMBER_ROLES.includes(r)) ?? false
  if (isGuest(u) && !isMember) return true
  if (!isMember) return false
  if (isAdmin(u)) return true
  // An intern who is not also a regular member has no messages tab.
  return !(isIntern(u) && !hasRole(u, 'regular'))
}

/**
 * The menu entry standing in for the public-facing section.
 *
 * While that section is hidden, the slot "Public Facing" occupied is given to
 * Content — the one page in the set with real material behind it.
 */
const PUBLIC_SLOT = (PUBLIC_SURFACE_ENABLED ? 'public' : PUBLIC_REPLACEMENT_TAB) as Tab

/** Drops tabs belonging to a hidden part of the public-facing surface. */
const onlyVisible = (tabs: Tab[]): Tab[] => tabs.filter((t) => isTabVisible(t))

export function visibleTabs(u: UserProfile | null): Tab[] {
  if (!u) return []

  const isMember = u.roles?.some((r) => MEMBER_ROLES.includes(r)) ?? false

  // Guests sit between public and member: their own tab set, and no member
  // role, so permission checks elsewhere treat them as public.
  if (isGuest(u) && !isMember) {
    return ['dashboard', 'events', 'assignments', 'announce', 'worship', 'music', 'settings']
  }

  // Users with no member role get public-facing tabs only.
  //
  // With that section hidden there is nothing left for them to read, so they
  // keep Settings and nothing else. Settings rather than an empty list on
  // purpose: it holds account deletion, which Guideline 5.1.1(v) requires to
  // stay reachable for anyone who has an account, and an empty list would
  // drop them on the "Account Pending" screen with only a sign-out button.
  //
  // Self-registration is closed, so nothing new lands here — these are
  // legacy public followers.
  if (!isMember) {
    if (!PUBLIC_SURFACE_ENABLED) return ['settings']
    return [
      'home',
      'events',
      'announce',
      'connect',
      'music',
      'giving',
      'story',
      'posts',
      'settings',
    ]
  }

  if (isAdmin(u)) {
    return [
      'dashboard',
      'events',
      'assignments',
      'announce',
      'issues',
      'security',
      'worship',
      'rolehub',
      PUBLIC_SLOT,
      'settings',
    ]
  }

  // Intern: public base + assignments + operations + specialty tabs. No dashboard or messages.
  if (isIntern(u) && !hasRole(u, 'regular')) {
    const tabs: Tab[] = [
      'home',
      'events',
      'assignments',
      'announce',
      'issues',
      'connect',
      'music',
      'giving',
      'story',
      'posts',
      'settings',
    ]
    if (hasRole(u, 'worship')) tabs.splice(tabs.indexOf('issues') + 1, 0, 'worship')
    if (hasRole(u, 'security')) tabs.splice(1, 0, 'security')
    return onlyVisible(tabs)
  }

  // Regular and specialty members
  const tabs: Tab[] = ['dashboard', 'events', 'assignments', 'announce', 'issues']

  if (isWorship(u)) tabs.push('worship')
  if (isSecurity(u)) tabs.push('security')
  // Inventory was gated on the merch role; with that gone it is admin-only,
  // and admins take the branch above, so nobody reaches it from here.

  tabs.push(PUBLIC_SLOT, 'settings')
  return tabs
}

/**
 * How a group's name is shown to people.
 *
 * "All" is the group every new member account joins, and guests deliberately
 * do not — they get their own. The stored name has to stay "All" because
 * user creation, event assignment and the group screens all match on it, so
 * the clarification lives in the label rather than the data.
 */
export function groupDisplayName(name: string): string {
  if (name === 'All') return 'All (team — excludes guests)'
  return name
}
