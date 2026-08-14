import { describe, it, expect } from 'vitest'
import {
  hasRole,
  isAdmin,
  isSecurity,
  canUseMessages,
  isPublic,
  isGuest,
  isReadOnly,
  visibleTabs,
  migrateRetiredRoles,
} from './roles'
import type { Tab } from './roles'
import type { UserProfile, Role } from '@/types/user'

const user = (...roles: Role[]) => ({ uid: 'u1', roles }) as UserProfile

describe('role predicates', () => {
  it('treats a null profile as having no roles', () => {
    // Every screen calls these before the profile has loaded.
    expect(hasRole(null, 'admin')).toBe(false)
    expect(isAdmin(null)).toBe(false)
    expect(isSecurity(null)).toBe(false)
  })

  it('grants admins the specialty roles implicitly', () => {
    // isSecurity gates the incident queue, so an admin must pass it without
    // being given the security role explicitly.
    expect(isSecurity(user('admin'))).toBe(true)
    expect(isSecurity(user('security'))).toBe(true)
    expect(isSecurity(user('regular'))).toBe(false)
  })

  it('does not treat public as a member role', () => {
    expect(isPublic(user('public'))).toBe(true)
    expect(isAdmin(user('public'))).toBe(false)
  })
})

describe('visibleTabs', () => {
  it('shows nothing before a profile exists', () => {
    expect(visibleTabs(null)).toEqual([])
  })

  it('keeps member-only tabs away from public users', () => {
    const tabs = visibleTabs(user('public'))

    expect(tabs).not.toContain('dashboard')
    expect(tabs).not.toContain('assignments')
  })

  it('leaves a public user nothing but settings while the public surface is hidden', () => {
    // Settings and not an empty list: it holds account deletion, which has to
    // stay reachable for anyone who still has an account.
    expect(visibleTabs(user('public'))).toEqual(['settings'])
  })

  it('treats a user with no roles at all as public', () => {
    expect(visibleTabs(user())).toEqual(['settings'])
  })

  it('gives admins the admin surfaces', () => {
    const tabs = visibleTabs(user('admin'))

    expect(tabs).toContain('dashboard')
    expect(tabs).toContain('rolehub')
  })

  it('withholds the dashboard from interns', () => {
    const tabs = visibleTabs(user('intern'))

    expect(tabs).not.toContain('dashboard')
    expect(tabs).toContain('assignments')
  })

  it('adds specialty tabs to an intern who also holds that role', () => {
    expect(visibleTabs(user('intern', 'worship'))).toContain('worship')
    expect(visibleTabs(user('intern', 'security'))).toContain('security')
  })

  it('never returns a duplicate tab', () => {
    // Several branches splice tabs in by index; overlapping roles must not
    // produce the same tab twice or the navigator gets duplicate keys.
    for (const u of [
      user('admin', 'security', 'worship'),
      user('intern', 'worship', 'security'),
      user('regular', 'worship'),
    ]) {
      const tabs = visibleTabs(u)
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })

  it('always includes settings, which holds account deletion', () => {
    // Guideline 5.1.1(v) requires account deletion to be reachable, and it
    // lives behind the settings tab.
    for (const u of [user('public'), user('admin'), user('intern'), user('regular')]) {
      expect(visibleTabs(u)).toContain('settings')
    }
  })
})

describe('migrateRetiredRoles', () => {
  it('leaves a profile without a retired role alone', () => {
    // Returning null lets the caller skip the write entirely.
    expect(migrateRetiredRoles(['regular'])).toBeNull()
    expect(migrateRetiredRoles(['admin', 'worship'])).toBeNull()
    expect(migrateRetiredRoles([])).toBeNull()
    expect(migrateRetiredRoles(undefined)).toBeNull()
  })

  it('drops merch and keeps the rest', () => {
    expect(migrateRetiredRoles(['merch', 'worship'])).toEqual(['worship'])
    expect(migrateRetiredRoles(['admin', 'merch'])).toEqual(['admin'])
  })

  it('makes a merch-only account regular rather than role-less', () => {
    // Dropping to [] would leave them with public-only access, which is a
    // demotion nobody asked for.
    expect(migrateRetiredRoles(['merch'])).toEqual(['regular'])
  })

  it('leaves the migrated account a member', () => {
    const migrated = migrateRetiredRoles(['merch'])!
    expect(visibleTabs({ uid: 'u1', roles: migrated } as never)).toContain('dashboard')
  })
})

describe('canUseMessages', () => {
  // Announcements and messages share one tab now, so who has messages is
  // asked separately from what appears in the drawer. These pin the same
  // answers the tab list used to give.
  it('gives messages to members', () => {
    expect(canUseMessages(user('admin'))).toBe(true)
    expect(canUseMessages(user('regular'))).toBe(true)
    expect(canUseMessages(user('worship'))).toBe(true)
    expect(canUseMessages(user('security'))).toBe(true)
  })

  it('gives messages to guests, who are messaged individually', () => {
    expect(canUseMessages(user('guest'))).toBe(true)
  })

  it('withholds messages from interns and the public', () => {
    expect(canUseMessages(user('intern'))).toBe(false)
    expect(canUseMessages(user('public'))).toBe(false)
    expect(canUseMessages(user())).toBe(false)
  })

  it('gives messages to an intern who is also a regular member', () => {
    expect(canUseMessages(user('intern', 'regular'))).toBe(true)
  })

  it('says no before a profile exists', () => {
    expect(canUseMessages(null)).toBe(false)
  })

  it('keeps announcements for every role that still has a surface', () => {
    // Public is excluded now, not because announcements were taken away from
    // it, but because the whole public-facing surface is hidden.
    for (const u of [user('intern'), user('guest'), user('regular')]) {
      expect(visibleTabs(u)).toContain('announce')
    }
  })
})

describe('guests', () => {
  const guest = user('guest')

  it('is not a member, so member-only permission checks say no', () => {
    // "Treated as public for permissions" is the whole design: guests hold no
    // member role, so anything gating on one excludes them without needing to
    // know guests exist.
    expect(isGuest(guest)).toBe(true)
    expect(isAdmin(guest)).toBe(false)
    expect(isSecurity(guest)).toBe(false)
    expect(hasRole(guest, 'regular')).toBe(false)
  })

  it('is read-only', () => {
    expect(isReadOnly(guest)).toBe(true)
    expect(isReadOnly(user('regular'))).toBe(false)
    // An admin who somehow also carries guest keeps their edit rights.
    expect(isReadOnly(user('guest', 'admin'))).toBe(false)
  })

  it('gets its own tab set, not the public one', () => {
    const tabs = visibleTabs(guest)

    expect(tabs).toContain('events')
    expect(tabs).toContain('worship')
    expect(tabs).toContain('music')
    expect(tabs).toContain('settings')
  })

  it('does not get member-only or public-only surfaces', () => {
    const tabs = visibleTabs(guest)

    // Operations belong to the team, not a visitor.
    expect(tabs).not.toContain('issues')
    expect(tabs).not.toContain('security')
    expect(tabs).not.toContain('inventory')
    expect(tabs).not.toContain('admin')
    // The wider public content set is deliberately not theirs either.
    expect(tabs).not.toContain('giving')
    expect(tabs).not.toContain('story')
    expect(tabs).not.toContain('posts')
    expect(tabs).not.toContain('connect')
  })

  it('does not become a guest tab set once a real role is added', () => {
    // A guest promoted to regular should get the member tabs.
    const promoted = visibleTabs(user('guest', 'regular'))

    expect(promoted).toContain('issues')
    expect(promoted).toContain('dashboard')
  })

  it('is distinct from public', () => {
    expect(isPublic(guest)).toBe(false)
    expect(visibleTabs(guest)).not.toEqual(visibleTabs(user('public')))
  })
})

describe('the hidden public-facing surface', () => {
  // Everything here should invert the day PUBLIC_SURFACE_ENABLED flips back
  // to true. They exist to catch a public page becoming reachable by accident.
  const HIDDEN: Tab[] = ['posts', 'connect', 'giving', 'story']

  it('keeps the Public Facing entry out of every menu', () => {
    for (const u of [
      user('admin'),
      user('regular'),
      user('intern'),
      user('guest'),
      user('public'),
      user('regular', 'worship'),
    ]) {
      expect(visibleTabs(u)).not.toContain('public')
    }
  })

  it('hides every public page except Content', () => {
    for (const u of [user('admin'), user('regular'), user('intern'), user('guest')]) {
      const tabs = visibleTabs(u)
      for (const hidden of HIDDEN) expect(tabs).not.toContain(hidden)
    }
  })

  it('gives Content the slot Public Facing used to hold', () => {
    // Admins and regular members had no Content entry of their own before —
    // they reached it through Public Facing, so it has to arrive here instead.
    expect(visibleTabs(user('admin'))).toContain('music')
    expect(visibleTabs(user('regular'))).toContain('music')
  })

  it('leaves Content where roles already had it', () => {
    expect(visibleTabs(user('intern'))).toContain('music')
    expect(visibleTabs(user('guest'))).toContain('music')
  })

  it('still returns no duplicates once Content is spliced in', () => {
    for (const u of [
      user('admin', 'worship'),
      user('regular', 'worship', 'security'),
      user('intern', 'worship'),
    ]) {
      const tabs = visibleTabs(u)
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })
})
