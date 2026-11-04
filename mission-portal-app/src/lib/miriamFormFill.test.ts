import { describe, expect, it } from 'vitest'
import { byName, formLines, scheduleOf, type FormNow } from './miriamFormFill'

describe('lists kept by name, as she fills them in', () => {
  it('puts each given in place of the one of its name, adds the rest, and keeps those not given', () => {
    const now = [
      { name: 'Setup', leaders: [], members: ['a'] },
      { name: 'Hospitality', leaders: [], members: ['b'] },
    ]
    const given = [
      { name: 'setup', leaders: [], members: ['a', 'c'] },
      { name: 'Worship', leaders: [], members: ['d'] },
    ]
    expect(byName(now, given, (t) => t.name)).toEqual([
      { name: 'setup', leaders: [], members: ['a', 'c'] },
      { name: 'Hospitality', leaders: [], members: ['b'] },
      { name: 'Worship', leaders: [], members: ['d'] },
    ])
    expect(byName(now, undefined, (t) => t.name)).toBe(now)
  })

  it('gives her schedule an id each, as the form keeps it', () => {
    expect(scheduleOf([{ time: '4:00 PM', title: 'Rehearsal', notes: 'Main hall' }], 7)).toEqual([
      { id: '7_0', time: '4:00 PM', title: 'Rehearsal', notes: 'Main hall' },
    ])
  })
})

describe('the form, as she is told it', () => {
  const blank: FormNow = {
    title: '',
    date: '',
    startTime: '',
    location: '',
    address: '',
    city: '',
    state: '',
    isRec: false,
    recDay: 0,
    isPublic: false,
    isVirtual: false,
    virtualLink: '',
    food: false,
    foodItems: [],
    carpool: false,
    cars: 0,
    lodging: 0,
    flights: 0,
    users: [],
    groups: [],
    teams: [],
    reportTimes: [],
    schedule: [],
    dressCode: [],
    taskTemplate: '',
  }
  const names: Record<string, string> = { emily: 'Emily Ruiz', ben: 'Ben Ortiz' }

  it('says nothing of what is empty', () => {
    expect(
      formLines(
        blank,
        (id) => names[id] ?? id,
        () => 'Men'
      )
    ).toEqual([])
  })

  it('names people and groups with their ids, and the teams, times and schedule', () => {
    const lines = formLines(
      {
        ...blank,
        title: 'Revive Me',
        startTime: '5:00 PM',
        city: 'Iowa City',
        state: 'IA',
        users: ['emily'],
        groups: ['gMen'],
        teams: [{ name: 'Worship', leaders: [], members: ['ben', 'emily'] }],
        reportTimes: [
          { group: 'Worship', time: '4:00 PM' },
          { group: '_remainder_', time: '4:30 PM' },
        ],
        schedule: [{ id: '1', time: '4:00 PM', title: 'Rehearsal' }],
      },
      (id) => names[id] ?? id,
      () => 'Men'
    )
    expect(lines).toEqual([
      'Title: Revive Me',
      'Starts: 5:00 PM',
      'City: Iowa City, IA',
      'Groups: Men [gMen]',
      'People: Emily Ruiz [emily]',
      'Teams: Worship (Ben Ortiz, Emily Ruiz)',
      'Report times: Worship 4:00 PM; everyone else 4:30 PM',
      'Schedule: 4:00 PM Rehearsal',
    ])
  })
})
