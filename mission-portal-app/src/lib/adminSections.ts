/**
 * The admin area's sections, in the order they appear.
 *
 * Consumed by both the Admin landing menu (`rolehub/admin.tsx`) and the tab bar
 * shown inside the admin screens (`admin/_layout.tsx`). Keep this as the single
 * source of truth — when the two lists were maintained separately they drifted,
 * leaving sections reachable from one entry point but not the other.
 *
 * Moderation is deliberately not here. It lives beside the conversations it
 * moderates, as a subtab of the Inbox, rather than several screens away in the
 * admin area.
 */
import { PUBLIC_SURFACE_ENABLED, EMAIL_FEATURES_ENABLED } from '@/lib/featureFlags'

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

const SECTIONS: AdminSection[] = [
  { key: 'users', label: 'User Management', path: '/(app)/admin/users', icon: '👥' },
  { key: 'avail', label: 'Availability', path: '/(app)/admin/avail', icon: '📆' },
  { key: 'groups', label: 'Groups', path: '/(app)/admin/groups', icon: '🗂' },
  { key: 'teams', label: 'Common Teams', path: '/(app)/admin/teams', icon: '🤝' },
  { key: 'templates', label: 'Task Templates', path: '/(app)/admin/templates', icon: '📋' },
  { key: 'leadership', label: 'Leadership Team', path: '/(app)/admin/leadership', icon: '⭐' },
  { key: 'finance', label: 'Finance', path: '/(app)/admin/finance', icon: '💵' },
  {
    key: 'analytics',
    label: 'Analytics',
    tabLabel: 'Public Analytics',
    path: '/(app)/admin/analytics',
    icon: '📊',
  },
  { key: 'audit', label: 'Audit Trail', path: '/(app)/admin/audit', icon: '🔍' },
  { key: 'data', label: 'Data & Backups', tabLabel: 'Data', path: '/(app)/admin/data', icon: '💾' },
  { key: 'miriam', label: 'Miriam', path: '/(app)/admin/miriam', icon: '💬' },
  { key: 'theme', label: 'Theme', path: '/(app)/admin/theme', icon: '🎨' },
  { key: 'digests', label: 'Digests', path: '/(app)/admin/digests', icon: '📰' },
  { key: 'licensing', label: 'Licensing', path: '/(app)/admin/licensing', icon: '📄' },
]

/**
 * Analytics reports on public users and nothing else, so it goes wherever the
 * public-facing surface goes. Digests are email, and follow that flag.
 */
export const ADMIN_SECTIONS: AdminSection[] = SECTIONS.filter((s) => {
  // Finance is the Accountant's, not every admin's: see adminSectionsFor.
  if (s.key === 'finance') return false
  if (s.key === 'analytics') return PUBLIC_SURFACE_ENABLED
  if (s.key === 'digests') return EMAIL_FEATURES_ENABLED
  return true
})

/**
 * The admin sections a given person sees.
 *
 * Finance is shown only to the Accountant, admin or not: it holds what
 * everyone spent and was paid back, which the rules let only the Accountant
 * read. Someone who is the Accountant without being an admin gets Finance
 * and nothing else (admin/_layout.tsx).
 */
export function adminSectionsFor(opts: { admin: boolean; accountant: boolean }): AdminSection[] {
  const finance = SECTIONS.find((s) => s.key === 'finance') as AdminSection
  const base = opts.admin ? ADMIN_SECTIONS : []
  return opts.accountant ? [...base, finance] : base
}
