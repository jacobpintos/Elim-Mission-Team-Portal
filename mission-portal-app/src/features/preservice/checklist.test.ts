import { describe, expect, it } from 'vitest'
import {
  bySection,
  canCheck,
  checklistOf,
  mineOf,
  progressOf,
  serviceDayFor,
  serviceDaySaid,
  storedChecklist,
  tidied,
  type Checklist,
} from './checklist'

const list: Checklist = checklistOf({
  items: {
    b: { text: 'Batteries in the mics', section: 'Sound', order: 1, assignees: ['mitch'] },
    a: { text: 'Lights on', section: '', order: 0, assignees: [] },
    c: { text: 'Line check', section: 'Sound', order: 2, assignees: ['mitch', 'sarah'] },
    d: { text: 'Lyrics loaded', section: 'Screens', order: 3, assignees: ['sarah'] },
  },
  serviceDays: [0],
})

describe('the Pre-service Checklist as stored', () => {
  it('is read in order, with nothing unreadable in it', () => {
    expect(list.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    const odd = checklistOf({
      items: {
        x: { text: '  Doors unlocked ', assignees: ['p', 'p', 3, ''] },
        y: { text: '   ' },
        z: 'nonsense',
      },
      serviceDays: [7, 'Sunday', 3, 3, 0],
    })
    expect(odd.items).toEqual([
      {
        id: 'x',
        text: 'Doors unlocked',
        section: '',
        order: Number.MAX_SAFE_INTEGER,
        assignees: ['p'],
      },
    ])
    expect(odd.serviceDays).toEqual([0, 3])
  })

  it('is empty, for Sundays, when there is none yet', () => {
    expect(checklistOf(undefined)).toEqual({ items: [], serviceDays: [0] })
    expect(checklistOf({ items: [], serviceDays: [] })).toEqual({ items: [], serviceDays: [0] })
  })

  it('is saved tidied, keyed by item, numbered in the order it was left in', () => {
    const edited: Checklist = {
      items: [
        { ...list.items[2], text: ' Line check  ' },
        { id: 'new', text: '', section: '', order: 9, assignees: [] },
        { ...list.items[0], assignees: ['p', 'p'] },
      ],
      serviceDays: [3, 0],
    }
    expect(tidied(edited).items.map((i) => [i.id, i.order])).toEqual([
      ['c', 0],
      ['a', 1],
    ])
    const stored = storedChecklist(edited)
    expect(stored.serviceDays).toEqual([0, 3])
    expect(stored.items).toEqual({
      c: { text: 'Line check', section: 'Sound', order: 0, assignees: ['mitch', 'sarah'] },
      a: { text: 'Lights on', section: '', order: 1, assignees: ['p'] },
    })
    // And reads back as it was left.
    expect(checklistOf(stored).items.map((i) => i.id)).toEqual(['c', 'a'])
  })
})

describe('which service it’s for', () => {
  it('is today on a service day, else the next one', () => {
    // 2026-11-08 is a Sunday.
    expect(serviceDayFor('2026-11-08', [0])).toBe('2026-11-08')
    expect(serviceDayFor('2026-11-09', [0])).toBe('2026-11-15')
    expect(serviceDayFor('2026-11-07', [0])).toBe('2026-11-08')
    // Sundays and Wednesdays: Monday's list is for Wednesday.
    expect(serviceDayFor('2026-11-09', [0, 3])).toBe('2026-11-11')
    // Over the end of a month and a year.
    expect(serviceDayFor('2026-12-28', [0])).toBe('2027-01-03')
  })

  it('is said as people say it', () => {
    expect(serviceDaySaid('2026-11-08')).toBe('Sunday, November 8')
    expect(serviceDaySaid('2027-01-03')).toBe('Sunday, January 3')
  })
})

describe('checking it off', () => {
  it('gives each person their own items', () => {
    expect(mineOf(list.items, 'mitch').map((i) => i.id)).toEqual(['b', 'c'])
    expect(mineOf(list.items, 'nobody')).toEqual([])
  })

  it('lets those given an item check it, and admins any', () => {
    const [lights, mics] = list.items
    expect(canCheck(mics, 'mitch', false)).toBe(true)
    expect(canCheck(mics, 'sarah', false)).toBe(false)
    expect(canCheck(lights, 'mitch', false)).toBe(false)
    expect(canCheck(lights, 'boss', true)).toBe(true)
    expect(canCheck(mics, '', false)).toBe(false)
  })

  it('counts how far along everyone is, leaving out checks for items no longer on it', () => {
    expect(progressOf(list.items, {})).toEqual({ done: 0, total: 4 })
    expect(
      progressOf(list.items, {
        b: { by: 'mitch', at: 1 },
        d: { by: 'sarah', at: null },
        gone: { by: 'x', at: 1 },
      })
    ).toEqual({ done: 2, total: 4 })
  })

  it('lists the whole of it under its headings, in the order they first come', () => {
    expect(bySection(list.items).map((g) => [g.section, g.items.map((i) => i.id)])).toEqual([
      ['', ['a']],
      ['Sound', ['b', 'c']],
      ['Screens', ['d']],
    ])
  })
})
