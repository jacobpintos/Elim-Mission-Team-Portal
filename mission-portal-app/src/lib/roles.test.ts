import { describe, it, expect } from 'vitest'
import { hasRole, isAdmin, isSecurity, isPublic, visibleTabs } from './roles'
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

    expect(tabs).not.toContain('messages')
    expect(tabs).not.toContain('dashboard')
    expect(tabs).not.toContain('assignments')
    expect(tabs).toContain('home')
  })

  it('treats a user with no roles at all as public', () => {
    const tabs = visibleTabs(user())

    expect(tabs).not.toContain('messages')
    expect(tabs).toContain('home')
  })

  it('gives admins the admin surfaces', () => {
    const tabs = visibleTabs(user('admin'))

    expect(tabs).toContain('dashboard')
    expect(tabs).toContain('messages')
    expect(tabs).toContain('rolehub')
  })

  it('withholds dashboard and messages from interns', () => {
    const tabs = visibleTabs(user('intern'))

    expect(tabs).not.toContain('dashboard')
    expect(tabs).not.toContain('messages')
    expect(tabs).toContain('assignments')
  })

  it('adds specialty tabs to an intern who also holds that role', () => {
    expect(visibleTabs(user('intern', 'worship'))).toContain('worship')
    expect(visibleTabs(user('intern', 'security'))).toContain('security')
    expect(visibleTabs(user('intern', 'merch'))).toContain('inventory')
  })

  it('never returns a duplicate tab', () => {
    // Several branches splice tabs in by index; overlapping roles must not
    // produce the same tab twice or the navigator gets duplicate keys.
    for (const u of [
      user('admin', 'security', 'worship'),
      user('intern', 'worship', 'security', 'merch'),
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
