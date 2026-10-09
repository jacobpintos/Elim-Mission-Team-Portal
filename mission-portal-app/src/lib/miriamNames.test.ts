import { describe, expect, it } from 'vitest'
import { nameScore } from '../../functions/src/miriam/names'
import {
  closestEvents,
  findEvents,
  type EventTemplate,
  type Viewer,
} from '../../functions/src/miriam/data'

describe('matching a name as it was heard', () => {
  it('finds a name misheard as it sounds, split or run together', () => {
    expect(
      nameScore('Revival In The Heartland', 'revival in the hard land')
    ).toBeGreaterThanOrEqual(0.5)
    expect(
      nameScore('Revival In The Heartland', 'revival in the heart land')
    ).toBeGreaterThanOrEqual(0.5)
    expect(nameScore('Night of Worship', 'nite of worship')).toBeGreaterThanOrEqual(0.5)
    expect(nameScore('Youth Lock-In', 'youth lockin')).toBeGreaterThanOrEqual(0.5)
    expect(nameScore('Coralville Outreach', 'coral ville outreach')).toBeGreaterThanOrEqual(0.5)
  })

  it('does not take one name for another', () => {
    expect(nameScore('Revival In The Heartland', 'prayer breakfast')).toBe(0)
    expect(nameScore('Sunday Service', 'monday meeting')).toBeLessThan(0.5)
  })
})

const sarah: Viewer = { uid: 'sarah', roles: ['regular'] }
const templates: EventTemplate[] = [
  { id: 'a', title: 'Revival In The Heartland', date: '2026-10-25', users: ['sarah'] },
  { id: 'b', title: 'Harvest Festival', date: '2026-10-31', users: ['sarah'] },
  { id: 'c', title: 'Hartford Leaders Retreat', date: '2026-11-07', users: ['boss'] },
  { id: 'd', title: 'Sunday Service', isRec: true, recur: 'weekly', recDay: 0, users: ['sarah'] },
]
const today = '2026-10-09'

describe('finding an event by a misheard name', () => {
  it('finds it outright when it is close enough', () => {
    const found = findEvents(templates, {}, [], sarah, 'revival in the hard land', today)
    expect(found.map((e) => e.title)).toEqual(['Revival In The Heartland'])
  })

  it('offers the nearest names it can see when nothing fits — never one it cannot', () => {
    expect(findEvents(templates, {}, [], sarah, 'fall harvest party night', today)).toEqual([])
    const near = closestEvents(templates, {}, [], sarah, 'fall harvest party night', today)
    expect(near.map((e) => e.title)).toContain('Harvest Festival')
    expect(near.map((e) => e.title)).not.toContain('Hartford Leaders Retreat')
  })

  it('offers one date per name: the next one', () => {
    const near = closestEvents(templates, {}, [], sarah, 'sunday servers', today)
    expect(near.filter((e) => e.title === 'Sunday Service').map((e) => e.date)).toEqual([
      '2026-10-11',
    ])
  })
})
