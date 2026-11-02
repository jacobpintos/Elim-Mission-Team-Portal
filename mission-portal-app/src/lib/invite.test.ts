import { describe, it, expect } from 'vitest'
import {
  facebookShareUrl,
  inviteMessage,
  mailUrl,
  nextSundayService,
  smsUrl,
  THE_WELL_SITE,
} from './invite'
import type { EventTemplate } from '@/types/events'

const service = {
  id: 'svc',
  title: 'Sunday Service',
  isRec: true,
  recur: 'weekly',
  recDay: 0,
  date: '2026-01-04',
  startTime: '10:00 AM',
  location: 'The Midnight Gem',
  address: '120 SW 5th St',
  city: 'Des Moines',
  state: 'IA',
  isPublic: true,
} as unknown as EventTemplate
const links = {
  site: THE_WELL_SITE,
  facebook: 'https://www.facebook.com/share/1EE9JBSnjC/',
  youtube: 'https://youtube.com/theelimarrival',
}
// Monday, November 2nd 2026, at noon.
const monday = new Date(2026, 10, 2, 12)

describe('nextSundayService', () => {
  it('is the coming Sunday’s, where the calendar says it is', () => {
    expect(nextSundayService([service], {}, monday)).toEqual({
      date: '2026-11-08',
      startTime: '10:00 AM',
      place: 'The Midnight Gem, 120 SW 5th St, Des Moines, IA',
      online: false,
    })
  })

  it('somewhere else that week, when that Sunday is moved', () => {
    const moved = {
      'svc_2026-11-08': {
        location: 'Grace Hall',
        address: '45 Elm Ave',
        city: 'Ankeny',
        startTime: '9:30 AM',
      },
    }
    expect(nextSundayService([service], moved, monday)).toEqual({
      date: '2026-11-08',
      startTime: '9:30 AM',
      place: 'Grace Hall, 45 Elm Ave, Ankeny, IA',
      online: false,
    })
  })

  it('the week after, when that Sunday is called off', () => {
    const off = { 'svc_2026-11-08': { deleted: true } as never }
    expect(nextSundayService([service], off, monday)?.date).toBe('2026-11-15')
  })

  it('today’s before it starts; next week’s once it has', () => {
    expect(nextSundayService([service], {}, new Date(2026, 10, 8, 8))?.date).toBe('2026-11-08')
    expect(nextSundayService([service], {}, new Date(2026, 10, 8, 11))?.date).toBe('2026-11-15')
  })

  it('the public one before a team’s, and none when there is none', () => {
    const teamCall = {
      ...service,
      id: 'call',
      title: 'Sunday Service — worship team call',
      isPublic: false,
      location: 'Online',
      recDay: 0,
    } as unknown as EventTemplate
    expect(nextSundayService([teamCall, service], {}, monday)?.place).toContain('Midnight Gem')
    expect(nextSundayService([], {}, monday)).toBeNull()
  })
})

describe('inviteMessage', () => {
  it('invites them to the day, time and place, with the links to look at', () => {
    const m = inviteMessage(nextSundayService([service], {}, monday), links, monday)
    expect(m.subject).toBe('Join me at church this Sunday')
    expect(m.body).toBe(
      [
        'Hi! I’d love for you to come to church with me this Sunday, November 8 at 10:00 AM. We’ll be at The Midnight Gem, 120 SW 5th St, Des Moines, IA.',
        '',
        'Get to know us before you come:',
        'The Well: https://thewellia.com',
        'Elim on Facebook: https://www.facebook.com/share/1EE9JBSnjC/',
        'Elim on YouTube: https://youtube.com/theelimarrival',
        '',
        'Hope to see you there!',
      ].join('\n')
    )
  })

  it('says no place it doesn’t know, and sends them to the site for one', () => {
    const m = inviteMessage(null, links, monday)
    expect(m.body).toContain('one Sunday. When and where we meet is at https://thewellia.com.')
    expect(m.body).not.toMatch(/Midnight Gem/)
  })

  it('makes the text, email and Facebook links', () => {
    expect(smsUrl('Hi! A & B')).toBe('sms:?&body=Hi!%20A%20%26%20B')
    expect(mailUrl('Join me', 'Line 1\nLine 2')).toBe(
      'mailto:?subject=Join%20me&body=Line%201%0ALine%202'
    )
    expect(facebookShareUrl('https://thewellia.com')).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fthewellia.com'
    )
  })
})
