import { describe, expect, it } from 'vitest'
import {
  availabilityReport,
  canAsk,
  canSeeEvent,
  canSeeTask,
  carpoolFor,
  dressCodeFor,
  eventByKey,
  findEvents,
  findTasks,
  flightsFor,
  foodFor,
  instancesOf,
  lodgingFor,
  type EventTemplate,
  type Group,
  type Task,
  type Viewer,
} from '../../functions/src/miriam/data'

const admin: Viewer = { uid: 'boss', roles: ['admin'] }
const sarah: Viewer = { uid: 'sarah', roles: ['regular'] }
const tom: Viewer = { uid: 'tom', roles: ['worship'] }
const guest: Viewer = { uid: 'gina', roles: ['guest'] }
const groups: Group[] = [{ id: 'gAll', name: 'All', members: ['sarah', 'tom', 'boss'] }]
const names = new Map([
  ['sarah', 'Sarah Lee'],
  ['tom', 'Tom Hart'],
  ['boss', 'Jacob Pintos'],
  ['gina', 'Gina Guest'],
  ['amy', 'Amy Ruiz'],
])

const revival: EventTemplate = {
  id: 'ev1',
  title: 'Revival In The Heartland',
  date: '2026-10-25',
  city: 'Coralville',
  state: 'IA',
  address: '1 Main St',
  startTime: '9:00 PM',
  groups: ['gAll'],
  teams: [{ name: 'Worship', leaders: ['tom'], members: [] }],
  dressCode: [
    { group: 'Worship', text: 'All black' },
    { group: '_remainder_', text: 'Team shirt and jeans' },
  ],
  carpool: true,
  carpoolCars: [
    { id: 'c1', label: 'Van', driver: 'boss', riders: ['sarah'] },
    { id: 'c2', label: '', driver: 'tom', riders: ['amy'] },
  ],
  flights: true,
  flightEntries: [
    {
      uid: 'sarah',
      outDate: '2026-10-24',
      outTime: '7:10 AM',
      outAirport: 'CID',
      outAirline: 'Delta',
      outFlight: '1234',
    },
    { uid: 'tom', outDate: '2026-10-24', outTime: '9:00 AM' },
  ],
  lodging: true,
  lodgingEntries: [
    { name: 'Hotel A', address: '5 Elm', room: '204', assignees: ['sarah'] },
    { name: 'Hotel B', assignees: ['tom'] },
  ],
  food: true,
  foodItems: ['Chips', 'Salsa', 'Cookies'],
}
const draft: EventTemplate = {
  id: 'ev2',
  title: 'Secret Planning',
  date: '2026-10-26',
  users: ['sarah'],
  unpublished: true,
}
const open: EventTemplate = {
  id: 'ev3',
  title: 'Open Prayer Night',
  date: '2026-10-27',
  isPublic: true,
}
const virtual: EventTemplate = {
  id: 'ev4',
  title: 'Team Zoom',
  date: '2026-10-28',
  users: ['sarah'],
  isVirtual: true,
  virtualLink: 'https://zoom.us/j/1',
}
const weekly: EventTemplate = {
  id: 'ev5',
  title: 'Sunday Service',
  isRec: true,
  recur: 'weekly',
  recDay: 0,
  users: ['sarah'],
}
const templates = [revival, draft, open, virtual, weekly]
const today = '2026-10-09'

describe('who may ask Miriam anything', () => {
  it('is every member and guest, not a public follower', () => {
    expect(canAsk(['regular'])).toBe(true)
    expect(canAsk(['guest'])).toBe(true)
    expect(canAsk(['public'])).toBe(false)
    expect(canAsk([])).toBe(false)
  })
})

describe('events, as the app shows them', () => {
  it('shows people the events they are on, and public ones; drafts to admins', () => {
    expect(canSeeEvent(revival, sarah, groups)).toBe(true) // by group
    expect(canSeeEvent(revival, guest, groups)).toBe(false)
    expect(canSeeEvent(open, guest, groups)).toBe(true)
    expect(canSeeEvent(draft, sarah, groups)).toBe(false) // on it, but a draft
    expect(canSeeEvent(draft, admin, groups)).toBe(true)
  })

  it('finds by name, city, or date — never one they cannot see', () => {
    const find = (v: Viewer, q: string, date = '') =>
      findEvents(templates, {}, groups, v, q, today, date).map((e) => e.title)
    expect(find(sarah, 'revival heartland')).toEqual(['Revival In The Heartland'])
    expect(find(sarah, 'Coralville')).toEqual(['Revival In The Heartland'])
    expect(find(sarah, 'secret planning')).toEqual([])
    expect(find(admin, 'secret planning')).toEqual(['Secret Planning'])
    expect(find(guest, 'revival')).toEqual([])
    expect(find(sarah, '', '2026-10-11')).toEqual(['Sunday Service'])
  })

  it('opens an event by key only for those who may see it', () => {
    expect(eventByKey(templates, {}, groups, sarah, 'ev1_2026-10-25')?.title).toBe(
      'Revival In The Heartland'
    )
    expect(eventByKey(templates, {}, groups, guest, 'ev1_2026-10-25')).toBeNull()
    expect(eventByKey(templates, {}, groups, sarah, 'ev5_2026-10-18')?.title).toBe('Sunday Service')
    expect(eventByKey(templates, {}, groups, sarah, 'ev5_2026-10-19')).toBeNull() // not a Sunday
  })

  it('repeats a weekly event on its day', () => {
    expect(instancesOf(weekly, '2026-10-09', '2026-10-31').map((i) => i.date)).toEqual([
      '2026-10-11',
      '2026-10-18',
      '2026-10-25',
    ])
  })
})

describe('dress code', () => {
  it('is your team’s, or everyone else’s; an admin hears them all', () => {
    expect(dressCodeFor(revival, tom)).toEqual(['All black'])
    expect(dressCodeFor(revival, sarah)).toEqual(['Team shirt and jeans'])
    expect(dressCodeFor(revival, admin)).toEqual([
      'Worship: All black',
      'Everyone else: Team shirt and jeans',
    ])
  })
})

describe('getting there and staying', () => {
  it('tells you your car; an admin every car', () => {
    expect(carpoolFor(revival, sarah, names)).toEqual([
      'Van (your car): driven by Jacob Pintos, riding: Sarah Lee',
    ])
    expect(carpoolFor(revival, admin, names)).toHaveLength(2)
    expect(carpoolFor(revival, guest, names)).toEqual([])
  })

  it('tells you your flight and lodging, and no one else’s', () => {
    expect(flightsFor(revival, sarah, names)).toEqual([
      'Your flight. Going: on 2026-10-24, at 7:10 AM, from CID, Delta 1234',
    ])
    expect(flightsFor(revival, admin, names)).toHaveLength(2)
    expect(lodgingFor(revival, sarah, names)).toEqual(['Hotel A (yours): 5 Elm, room 204'])
    expect(lodgingFor(revival, tom, names)).toEqual(['Hotel B (yours)'])
  })

  it('reads the food sheet, and what is yours on it', () => {
    const food = foodFor(
      revival,
      { '0': { uid: 'sarah' }, '2': { uid: 'tom', displayName: 'Tom Hart' } },
      sarah,
      names
    )
    expect(food.mine).toEqual(['Chips'])
    expect(food.sheet).toEqual(['Chips: you', 'Salsa: nobody yet', 'Cookies: Tom Hart'])
  })
})

describe('availability', () => {
  const ev = instancesOf(revival, '2026-10-25', '2026-10-25')[0]
  const responses = {
    sarah: { status: 'tbd' as const, note: 'Waiting on work' },
    tom: { status: 'partial' as const, note: 'After 8' },
  }
  it('lists, for an admin, everyone not plainly available — TBD and partial too', () => {
    const r = availabilityReport(ev, groups, names, responses, {}, admin)
    expect(r.everyone).toEqual({
      notAvailable: [],
      partly: ['Tom Hart (“After 8”)'],
      notSure: ['Sarah Lee (“Waiting on work”)'],
      noAnswer: ['Jacob Pintos'],
      available: 0,
      total: 3,
    })
  })
  it('tells anyone else only their own', () => {
    const r = availabilityReport(ev, groups, names, responses, {}, sarah)
    expect(r.everyone).toBeUndefined()
    expect(r.mine).toBe('Not sure yet (TBD) — “Waiting on work”')
  })
})

describe('tasks', () => {
  const tasks: Task[] = [
    { id: 't1', title: 'Book the sound tech', status: 'in_progress', assignees: ['sarah'] },
    { id: 't2', title: 'Print programs', status: 'pending', assignees: ['tom'] },
  ]
  it('are yours; an admin sees them all', () => {
    expect(canSeeTask(tasks[1], sarah)).toBe(false)
    expect(findTasks(tasks, sarah, 'print programs')).toEqual([])
    expect(findTasks(tasks, admin, 'print programs').map((t) => t.id)).toEqual(['t2'])
    expect(findTasks(tasks, sarah, 'sound').map((t) => t.id)).toEqual(['t1'])
  })
})
