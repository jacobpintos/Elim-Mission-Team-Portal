import { describe, expect, it } from 'vitest'
import { tourFor, tourNames } from './index'
import { tourAsked } from '@/lib/miriamTour'
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

describe('a tour asked of Miriam, heard on the device', () => {
  it('hears a tour asked for, and of which part', () => {
    const cases: [string, string][] = [
      ['Give me a tour', ''],
      ['Hey Miriam, can you give me a quick tour of the app?', ''],
      ['give me a tour of the worship tab please', 'worship'],
      ['Start the tour of events', 'events'],
      ['tour of chord sheets', 'chord sheets'],
      ['Walk me through Operations', 'operations'],
      ['show me around', ''],
      ['Show me around the admin panel', 'admin panel'],
      ['show me how the Events tab works', 'events'],
    ]
    for (const [said, part] of cases) expect(tourAsked(said), said).toEqual({ part })
  })

  it('leaves questions and everything else to be answered', () => {
    for (const said of [
      'How do I create an event?',
      'when is the tour bus leaving',
      'who is going on the Kenya tour',
      'open Above All',
    ]) {
      expect(tourAsked(said), said).toBeNull()
    }
  })
})

describe('the tour, kept up to date', () => {
  it('starts with Miriam, as each role can use her', () => {
    const member = tourFor('', person('regular'))!.steps.map((s) => s.id)
    expect(member.slice(0, 2)).toEqual(['welcome', 'miriam-intro'])
    expect(member).toContain('miriam-actions')
    expect(member).not.toContain('miriam-admin')
    expect(tourFor('', person('admin'))!.steps.map((s) => s.id)).toContain('miriam-admin')
    expect(ids(tourFor('', person('guest')))).not.toContain('miriam-actions')
    expect(tourFor('you', person('regular'))?.title).toBe('Miriam')
  })

  it('shows the worship team voice control and playing from a sheet', () => {
    const worship = ids(tourFor('worship', person('regular', 'worship')))
    expect(worship).toEqual(expect.arrayContaining(['worship-play', 'worship-voice']))
  })
})
