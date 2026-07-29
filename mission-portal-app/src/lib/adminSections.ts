/**
 * The admin area's sections, in the order they appear.
 *
 * Consumed by both the Admin landing menu (`rolehub/admin.tsx`) and the tab bar
 * shown inside the admin screens (`admin/_layout.tsx`). Keep this as the single
 * source of truth — when the two lists were maintained separately they drifted,
 * leaving sections reachable from one entry point but not the other.
 */
export interface AdminSection {
  /** Last path segment, used to mark the active tab. */
  key: string
  /** Label in the landing menu. */
  label: string
  /** Shorter label for the horizontal tab bar, when the full one is unwieldy. */
  tabLabel?: string
  path: string
  icon: string
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'users', label: 'User Management', path: '/(app)/admin/users', icon: '👥' },
  { key: 'moderation', label: 'Moderation', path: '/(app)/admin/moderation', icon: '🚩' },
  { key: 'avail', label: 'Availability', path: '/(app)/admin/avail', icon: '📆' },
  { key: 'groups', label: 'Groups', path: '/(app)/admin/groups', icon: '🗂' },
  { key: 'teams', label: 'Common Teams', path: '/(app)/admin/teams', icon: '🤝' },
  { key: 'templates', label: 'Task Templates', path: '/(app)/admin/templates', icon: '📋' },
  { key: 'leadership', label: 'Leadership Team', path: '/(app)/admin/leadership', icon: '⭐' },
  {
    key: 'analytics',
    label: 'Analytics',
    tabLabel: 'Public Analytics',
    path: '/(app)/admin/analytics',
    icon: '📊',
  },
  { key: 'audit', label: 'Audit Trail', path: '/(app)/admin/audit', icon: '🔍' },
  { key: 'theme', label: 'Theme', path: '/(app)/admin/theme', icon: '🎨' },
  { key: 'digests', label: 'Digests', path: '/(app)/admin/digests', icon: '📰' },
  { key: 'licensing', label: 'Licensing', path: '/(app)/admin/licensing', icon: '📄' },
]
