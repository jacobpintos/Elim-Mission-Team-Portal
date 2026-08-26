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
  countsTowardAllGroup,
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

  it('gives a public user the visitor-facing pages', () => {
    const tabs = visibleTabs(user('public'))

    for (const t of ['home', 'posts', 'connect', 'giving', 'story', 'music'] as Tab[]) {
      expect(tabs).toContain(t)
    }
    // Settings is never dropped: it holds account deletion, which has to stay
    // reachable for anyone who has an account at all.
    expect(tabs).toContain('settings')
  })

  it('treats a user with no roles at all as public', () => {
    expect(visibleTabs(user())).toEqual(visibleTabs(user('public')))
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

  it('keeps announcements for every role, including the public one', () => {
    // Reading announcements and being able to reply to them are separate: a
    // public follower and an intern both get the tab and neither gets
    // messages, which is the split canUseMessages exists to express.
    for (const u of [user('intern'), user('guest'), user('regular'), user('public')]) {
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

describe('the public-facing surface, as a member sees it', () => {
  const MEMBERS = [
    user('admin'),
    user('regular'),
    user('intern'),
    user('regular', 'worship'),
    user('intern', 'worship'),
  ]

  it('gives every member the Public Facing tab', () => {
    for (const u of MEMBERS) expect(visibleTabs(u)).toContain('public')
  })

  it('keeps Content as an entry of its own beside it', () => {
    // The one page in the set a member opens regularly, so it does not get
    // buried a level down inside Public Facing.
    for (const u of MEMBERS) expect(visibleTabs(u)).toContain('music')
  })

  it('puts Content immediately before Public Facing', () => {
    for (const u of MEMBERS) {
      const tabs = visibleTabs(u)
      expect(tabs.indexOf('music')).toBe(tabs.indexOf('public') - 1)
    }
  })

  it('does not scatter the visitor pages through a member menu', () => {
    // They live inside Public Facing. An intern used to get all five as loose
    // top-level entries, which made one member's menu a different shape.
    for (const u of MEMBERS) {
      const tabs = visibleTabs(u)
      for (const inside of ['posts', 'connect', 'giving', 'story'] as Tab[]) {
        expect(tabs).not.toContain(inside)
      }
    }
  })

  it('leaves guests out of it, since a guest is not a visitor either', () => {
    const tabs = visibleTabs(user('guest'))
    expect(tabs).not.toContain('public')
    expect(tabs).toContain('music')
  })

  it('still returns no duplicates', () => {
    for (const u of [...MEMBERS, user('regular', 'worship', 'security'), user('public')]) {
      const tabs = visibleTabs(u)
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })
})

describe('countsTowardAllGroup', () => {
  /**
   * "All" addresses the team. A public follower and a guest are not on it, and
   * neither is a uid left behind by an account that no longer exists.
   */
  it('counts every member role', () => {
    for (const r of ['admin', 'security', 'regular', 'intern', 'worship']) {
      expect(countsTowardAllGroup(user(r as never))).toBe(true)
    }
  })

  it('does not count a public follower or a guest', () => {
    expect(countsTowardAllGroup(user('public'))).toBe(false)
    expect(countsTowardAllGroup(user('guest'))).toBe(false)
  })

  it('counts someone who is both a guest and a member', () => {
    // A member brought along on a trip is still a member.
    expect(countsTowardAllGroup(user('guest', 'regular'))).toBe(true)
  })

  it('does not count a uid nothing resolves to', () => {
    // A deleted account whose uid was left in the group's member list.
    expect(countsTowardAllGroup(null)).toBe(false)
    expect(countsTowardAllGroup(undefined)).toBe(false)
  })

  it('does not count an account carrying no roles at all', () => {
    expect(countsTowardAllGroup(user())).toBe(false)
  })
})
