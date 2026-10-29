import { describe, it, expect } from 'vitest'
import { buildICS } from './events'
import type { EventInstance } from '@/types/events'

const nye = {
  id: 'e1',
  instanceKey: 'e1',
  templateId: 'e1',
  title: 'New Years Eve',
  date: '2026-12-31',
  startTime: '5 PM',
  location: 'The Midnight Gem',
  address: '2613 Ders Drive Northwest',
  city: 'Swisher',
  state: 'IA',
  rtp: '3:00 PM',
  dcw: 'All black',
  teams: [{ id: 't', name: 'WALL TEAM', leaders: [], members: [] }],
} as unknown as EventInstance

const line = (ics: string, name: string) => ics.split('\r\n').find((l) => l.startsWith(name)) ?? ''

describe('an event as a calendar file', () => {
  it('starts at its time, however it was written, and runs two hours', () => {
    for (const startTime of ['5 PM', '5:00 PM', '5pm', '17:00', '5:00 PM (doors 4:30)']) {
      const ics = buildICS({ ...nye, startTime }, { team: true })
      expect(line(ics, 'DTSTART'), startTime).toBe('DTSTART:20261231T170000')
      expect(line(ics, 'DTEND'), startTime).toBe('DTEND:20261231T190000')
    }
  })

  it('ends on the next day when the two hours pass midnight', () => {
    const ics = buildICS({ ...nye, startTime: '10:30 PM' }, { team: true })
    expect(line(ics, 'DTSTART')).toBe('DTSTART:20261231T223000')
    expect(line(ics, 'DTEND')).toBe('DTEND:20270101T003000')
  })

  it('is the whole day, ending the next, when it has no time it can read', () => {
    for (const startTime of ['', 'Evening']) {
      const ics = buildICS({ ...nye, startTime }, { team: true })
      expect(line(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261231')
      expect(line(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20270101')
    }
  })

  it('gives where it is in full', () => {
    expect(line(buildICS(nye, { team: false }), 'LOCATION')).toBe(
      'LOCATION:The Midnight Gem\\, 2613 Ders Drive Northwest\\, Swisher\\, IA'
    )
  })

  it('keeps the team side — dress code, teams — for the team', () => {
    const team = line(buildICS(nye, { team: true }), 'DESCRIPTION')
    expect(team).toContain('Teams: WALL TEAM')
    expect(team).toContain('Dress Code (Worship): All black')
    expect(team).toContain('\\n')
    const follower = line(buildICS(nye, { team: false }), 'DESCRIPTION')
    expect(follower).not.toMatch(/Teams|Report Time|Dress Code/)
  })

  it('gives the report times they are shown, and none otherwise', () => {
    const one = line(
      buildICS(nye, { team: true, report: [{ who: null, time: '3:00 PM' }] }),
      'DESCRIPTION'
    )
    expect(one).toContain('Report Time: 3:00 PM')
    const two = line(
      buildICS(nye, {
        team: true,
        report: [
          { who: 'Worship', time: '3:00 PM' },
          { who: 'Setup', time: '2:00 PM' },
        ],
      }),
      'DESCRIPTION'
    )
    expect(two).toContain('Report Time (Worship): 3:00 PM\\nReport Time (Setup): 2:00 PM')
    // Its own fields aren't read: only what they're shown.
    expect(line(buildICS(nye, { team: true }), 'DESCRIPTION')).not.toMatch(/Report Time/)
  })

  it('gives an online event its link', () => {
    const ics = buildICS(
      { ...nye, isVirtual: true, virtualLink: 'https://zoom.us/j/1' },
      { team: false }
    )
    expect(line(ics, 'LOCATION')).toBe('LOCATION:Online')
    expect(line(ics, 'DESCRIPTION')).toContain('Join online: https://zoom.us/j/1')
  })
})

describe('each event once', () => {
  it('keeps a recurring or multi-day event at its next date', async () => {
    const { nextOfEach, repeatsSaid } = await import('./events')
    const at = (templateId: string, date: string) =>
      ({ templateId, date, instanceKey: `${templateId}_${date}` }) as unknown as EventInstance
    const list = [
      at('sun', '2026-11-01'),
      at('test', '2026-11-03'),
      at('sun', '2026-11-08'),
      at('camp', '2026-11-10'),
      at('camp', '2026-11-11'),
      at('sun', '2026-11-15'),
    ]
    expect(nextOfEach(list).map((e) => e.instanceKey)).toEqual([
      'sun_2026-11-01',
      'test_2026-11-03',
      'camp_2026-11-10',
    ])
    expect(repeatsSaid({ isRec: true, recur: 'weekly' })).toBe('every week')
    expect(repeatsSaid({ isRec: true, recur: 'biweekly' })).toBe('every other week')
    expect(repeatsSaid({ isRec: false })).toBeNull()
  })
})
