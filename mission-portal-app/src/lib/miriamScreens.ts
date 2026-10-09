import type { UserProfile } from '@/types/user'
import { canUseMessages, isAdmin, visibleTabs, type Tab } from './roles'
import { ADMIN_SECTIONS } from './adminSections'

/**
 * The screens Miriam can take someone to: the ones their menu has, and the
 * pages inside them they can reach — Operations' sub-tabs, the admin panel's
 * sections — and nothing else. Built from the same rules as the menu
 * (lib/roles: visibleTabs), so a screen not offered there is not offered here;
 * and checked again before one is opened (MiriamButton).
 */
export interface MiriamScreen {
  id: string
  label: string
  path: string
}

const TAB_NAMES: Record<Tab, string> = {
  dashboard: 'Dashboard',
  home: 'Home',
  events: 'Events',
  assignments: 'Assignments (tasks)',
  messages: 'Messages',
  issues: 'Operations — Issues',
  security: 'Security',
  inventory: 'Inventory',
  announce: 'Announcements',
  worship: 'Worship — set lists and chord sheets',
  admin: 'Admin',
  public: 'Public Facing',
  music: 'Content — music, sermons and podcasts',
  posts: 'Posts',
  giving: 'Giving',
  story: 'Our Story',
  connect: 'Connect',
  rolehub: 'Role hub',
  settings: 'Profile & Settings',
}

export function screensFor(profile: UserProfile | null): MiriamScreen[] {
  const tabs = visibleTabs(profile)
  const screens: MiriamScreen[] = tabs.map((t) => ({ id: t, label: TAB_NAMES[t], path: `/${t}` }))
  const admin = isAdmin(profile)
  if (tabs.includes('events')) {
    screens.push({ id: 'events_map', label: 'Events — map', path: '/events/map' })
  }
  if (canUseMessages(profile)) {
    screens.push({ id: 'messages', label: 'Messages', path: '/messages' })
  }
  if (tabs.includes('issues')) {
    screens.push({ id: 'kaizen', label: 'Operations — Kaizen', path: '/issues/kaizen' })
    if (admin) {
      screens.push(
        { id: 'planning', label: 'Operations — Planning', path: '/issues/planning' },
        { id: 'ops_inventory', label: 'Operations — Inventory', path: '/issues/inventory' }
      )
    }
  }
  if (admin) {
    screens.push({ id: 'admin', label: 'Admin panel', path: '/rolehub/admin' })
    for (const s of ADMIN_SECTIONS) {
      screens.push({ id: `admin_${s.key}`, label: `Admin — ${s.label}`, path: s.path })
    }
  }
  if (tabs.includes('settings')) {
    screens.push({ id: 'blocked', label: 'Settings — Blocked people', path: '/blocked' })
  }
  // One of each: messages can come from the menu and from canUseMessages.
  return screens.filter((s, i) => screens.findIndex((x) => x.id === s.id) === i)
}
