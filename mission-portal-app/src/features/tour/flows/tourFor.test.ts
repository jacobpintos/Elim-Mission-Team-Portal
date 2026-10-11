import { describe, expect, it } from 'vitest'
import { tourFor, tourNames } from './index'
import type { UserProfile } from '@/types/user'

const person = (...roles: string[]) =>
  ({ uid: 'u', displayName: 'Sam', email: 's@x.org', roles }) as unknown as UserProfile
const ids = (t: ReturnType<typeof tourFor>) => t?.steps.map((s) => s.id) ?? []

describe('the tour Miriam gives, as each person’s role has it', () => {
  const member = person('regular')
  const admin = person('admin')
  const intern = person('intern')

  it('shows a member the Events tour without how to create an event; an admin with it', () => {
    expect(ids(tourFor('events', member))).toContain('events-availability')
    expect(ids(tourFor('events', member))).not.toContain('events-create')
    expect(ids(tourFor('events', admin))).toContain('events-create')
  })

  it('finds a part by the words used for it', () => {
    expect(tourFor('the Events tab', member)?.title).toBe('Events')
    expect(tourFor('calendar', member)?.title).toBe('Events')
    expect(tourFor('chord sheets', admin)?.title).toBe('Worship')
    expect(tourFor('operations', member)?.title).toBe('Operations')
  })

  it('gives no tour of a part someone doesn’t have', () => {
    expect(tourFor('security', member)).toBeNull()
    expect(tourFor('admin', member)).toBeNull()
    expect(tourFor('inventory', member)).toBeNull()
    expect(tourFor('messages', intern)).toBeNull()
    expect(tourFor('security', admin)).not.toBeNull()
    expect(tourFor('inventory', admin)).not.toBeNull()
    expect(tourFor('messages', member)).not.toBeNull()
  })

  it('gives the whole app’s tour, from the welcome, for "" or "everything"', () => {
    const whole = tourFor('', member)
    expect(whole?.steps[0].id).toBe('welcome')
    expect(ids(whole)).toContain('events-availability')
    expect(ids(whole)).not.toContain('events-create')
    expect(tourFor('everything', admin)?.steps.length).toBeGreaterThan(whole!.steps.length)
  })

  it('names the parts a person can be shown', () => {
    expect(tourNames(member)).toContain('Events')
    expect(tourNames(member)).not.toContain('Security')
    expect(tourNames(admin)).toContain('Security')
  })
})
