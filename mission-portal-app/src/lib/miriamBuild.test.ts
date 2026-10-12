import { describe, expect, it } from 'vitest'
import { setListKey, templateDue, templateFrom } from './miriamActions'
import { setListsFound } from './miriamAppData'

describe('a task template, as said', () => {
  it('makes sections from their names, with every task in one', () => {
    const made = templateFrom({
      name: 'Test 3',
      sections: [
        {
          name: 'Production',
          tasks: ['Task 1', 'Task 2', 'Task 3'].map((title) => ({
            title,
            people_ids: ['bob'],
            group_ids: [],
            days_before: 7,
            days_after: 0,
          })),
        },
        {
          name: 'Pastoral Care',
          tasks: [
            {
              title: 'Task 7',
              people_ids: ['austin'],
              group_ids: [],
              days_before: 10,
              days_after: 0,
            },
            {
              title: 'Follow up',
              people_ids: [],
              group_ids: ['g1'],
              days_before: 0,
              days_after: 2,
            },
          ],
        },
      ],
    })
    if (typeof made === 'string') throw new Error(made)
    expect(made.sections.map((s) => [s.id, s.label])).toEqual([
      ['production', 'Production'],
      ['pastoral_care', 'Pastoral Care'],
    ])
    expect(made.tasks).toHaveLength(5)
    expect(made.tasks[0]).toEqual({
      title: 'Task 1',
      assignees: ['bob'],
      assigneeGroups: [],
      daysBefore: 7,
      section: 'production',
    })
    expect(templateDue(made.tasks[3])).toBe('10 days before')
    expect(made.tasks[4]).toMatchObject({ daysBefore: 0, daysAfterEvent: 2 })
    expect(templateDue(made.tasks[4])).toBe('2 days after')
  })
  it('refuses one with no name or no tasks', () => {
    expect(templateFrom({ name: '', sections: [] })).toBe('A task template needs a name.')
    expect(templateFrom({ name: 'X', sections: [{ name: 'A', tasks: [] }] })).toBe(
      'A task template needs at least one task.'
    )
  })
})

describe('a key, as a set list holds it', () => {
  it('spells it as the key picker does', () => {
    expect(setListKey('D')).toBe('D')
    expect(setListKey('Bb')).toBe('Bb')
    expect(setListKey('b flat')).toBe('Bb')
    expect(setListKey('C#')).toBe('Db')
    expect(setListKey('Gb')).toBe('F#')
    expect(setListKey('F#m')).toBe('F#')
    expect(setListKey('b')).toBe('B')
    expect(setListKey('')).toBe('')
    expect(setListKey('H')).toBe('')
  })
})

describe('set lists, looked up', () => {
  const lists = [
    {
      id: 1,
      title: 'Sunday AM',
      eventDate: '2026-10-18',
      songs: [{ name: 'Above All', key: 'D' }],
    },
    { id: 2, title: 'Revival night', eventDate: '2026-10-11', songs: [] },
    { id: 3, title: 'Last week', eventDate: '2026-10-04', songs: [] },
  ]
  const ev = (l: (typeof lists)[number]) => (l.id === 1 ? 'Sunday Service' : '')
  it('gives the next ones coming up, nearest first', () => {
    expect(setListsFound(lists, ev, '', '', '2026-10-11').map((l) => l.id)).toEqual(['2', '1', '3'])
  })
  it('finds one by its event or date, with its songs in order', () => {
    const [found] = setListsFound(lists, ev, 'sunday service', '', '2026-10-11')
    expect(found).toEqual({
      id: '1',
      name: 'Sunday AM',
      event: 'Sunday Service',
      date: '2026-10-18',
      songs: ['1. Above All (D)'],
    })
    expect(setListsFound(lists, ev, '', '2026-10-04', '2026-10-11').map((l) => l.id)).toEqual(['3'])
  })
})
