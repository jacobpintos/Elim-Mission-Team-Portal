import { describe, it, expect } from 'vitest'
import { keyParts, publicEventView } from '../../functions/src/publicEventView'

const service = {
  title: 'Sunday Service',
  isRec: true,
  recur: 'weekly',
  recDay: 0,
  date: '2026-01-04',
  startTime: '10:00 AM',
  location: 'The Midnight Gem',
  city: 'Swisher',
  state: 'IA',
  isPublic: true,
  users: ['u1', 'u2'],
  groups: ['g1'],
  description: 'Come as you are.',
  overrides: {
    'svc_2026-11-08': { location: 'Grace Hall', city: 'Ankeny' },
    'svc_2026-11-15': { isPublic: false },
    'svc_2026-11-22': { deleted: true },
  },
}

describe('publicEventView', () => {
  it('reads the key', () => {
    expect(keyParts('svc_2026-11-08')).toEqual({ id: 'svc', date: '2026-11-08' })
    expect(keyParts('camp_2026-07-01_d2')).toEqual({ id: 'camp', date: '2026-07-01' })
    expect(keyParts('nonsense')).toBeNull()
  })

  it('gives a public date’s own details, and nothing of who is on it', () => {
    const v = publicEventView(service, 'svc', 'svc_2026-11-08')
    expect(v).toMatchObject({
      title: 'Sunday Service',
      date: '2026-11-08',
      startTime: '10:00 AM',
      location: 'Grace Hall',
      city: 'Ankeny',
      description: 'Come as you are.',
    })
    expect(JSON.stringify(v)).not.toMatch(/u1|g1|users|groups/)
  })

  it('nothing for a date made private, called off, or not on its calendar', () => {
    expect(publicEventView(service, 'svc', 'svc_2026-11-15')).toBeNull()
    expect(publicEventView(service, 'svc', 'svc_2026-11-22')).toBeNull()
    expect(publicEventView(service, 'svc', 'svc_2026-11-10')).toBeNull()
    expect(publicEventView(service, 'other', 'svc_2026-11-08')).toBeNull()
  })

  it('nothing for an event that isn’t public, or is a draft', () => {
    expect(
      publicEventView({ ...service, isPublic: false, overrides: {} }, 'svc', 'svc_2026-11-08')
    ).toBeNull()
    expect(publicEventView({ ...service, unpublished: true }, 'svc', 'svc_2026-11-08')).toBeNull()
  })
})
