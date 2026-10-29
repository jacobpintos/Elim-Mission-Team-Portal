import { describe, expect, it } from 'vitest'
import { briefingAsked, buildBriefing, type BriefingInput } from './briefing'

const today = '2026-10-18' // a Sunday
const templates = [
  {
    id: 'sun',
    title: 'Sunday Service',
    date: today,
    startTime: '10:00 AM',
    location: 'The Well',
    users: ['me'],
    teams: [{ name: 'Worship', leaders: [], members: ['me'] }],
    dressCode: [
      { group: 'Worship', text: 'Black jeans, white tee' },
      { group: '_remainder_', text: 'RITH shirt' },
    ],
  },
  {
    id: 'rev',
    title: 'Revival in the Heartland',
    date: today,
    startTime: '5 PM',
    location: 'Xtreme Arena',
    city: 'Wichita',
    users: ['me', 'sam'],
    carpool: true,
    carpoolCars: [{ id: 'c', label: 'Andy’s truck', driver: 'me', riders: ['sam'] }],
  },
  { id: 'ret', title: 'Youth Retreat', date: '2026-10-23', startTime: '8 AM', users: ['me'] },
]
const input = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  now: new Date(2026, 9, 18, 7, 30),
  firstName: 'Jacob',
  viewer: { uid: 'me', roles: ['admin'] },
  groups: [],
  names: new Map([
    ['me', 'Jacob'],
    ['sam', 'Sam'],
  ]),
  templates: templates as never,
  overrides: {},
  tasks: [
    { id: '1', title: 'Book the bus', status: 'pending', dueDate: '2026-10-16', assignees: ['me'] },
    { id: '2', title: 'Print flyers', status: 'pending', dueDate: today, assignees: ['me'] },
    { id: '3', title: 'Order shirts', status: 'pending', dueDate: '2026-10-21', assignees: ['me'] },
    { id: '4', title: 'Later', status: 'pending', dueDate: '2026-11-30', assignees: ['me'] },
    { id: '5', title: 'Sam’s', status: 'pending', dueDate: today, assignees: ['sam'] },
  ],
  reminders: [
    { id: 'r', text: 'Go to Costco', remindAt: new Date(2026, 9, 18, 17).getTime(), done: false },
    { id: 'r2', text: 'Tomorrow thing', remindAt: new Date(2026, 9, 19, 9).getTime(), done: false },
  ],
  announcements: [{ id: 'a', title: 'Practice moved to 6 on Thursday', ts: 1 }],
  unread: [
    { name: 'Sam', count: 2 },
    { name: 'Worship chat', count: 2 },
  ],
  attention: [],
  weather: { 'rev_2026-10-18': { high: 68.2, label: 'Clear' } },
  ...over,
})

describe('the daily briefing', () => {
  it('lays out today, tasks, reminders and what’s new', () => {
    const b = buildBriefing(input())
    expect(b.greeting).toBe('Good morning, Jacob')
    expect(b.today.map((e) => [e.title, e.time, e.meridiem])).toEqual([
      ['Sunday Service', '10:00', 'AM'],
      ['Revival in the Heartland', '5:00', 'PM'],
    ])
    // Their own team and dress code, even as an admin; their car; the forecast.
    expect(b.today[0].chips).toEqual(['Worship team', 'Black jeans, white tee'])
    expect(b.today[1].chips).toEqual(['Andy’s truck: driven by you, riding: Sam', '68°, clear'])
    expect(b.tasks.map((t) => [t.title, t.label])).toEqual([
      ['Book the bus', '2 days overdue'],
      ['Print flyers', 'Due today'],
      ['Order shirts', 'Due Wednesday'],
    ])
    expect(b.reminders.map((r) => r.text)).toEqual(['Go to Costco'])
    expect(b.news.map((n) => n.title)).toEqual([
      'Practice moved to 6 on Thursday',
      '4 unread messages',
    ])
    expect(b.needs).toBe(3)
    expect(b.dateLine).toBe('Sunday, October 18 · 3 things need you')
  })
  it('shows a public follower none of an event’s team side, as its page shows them none', () => {
    // Made a public follower after being put on the team and in a car.
    const b = buildBriefing(input({ viewer: { uid: 'me', roles: ['public'] } }))
    expect(b.today.map((e) => e.chips)).toEqual([[], []])
    expect(b.spoken).not.toMatch(/Worship\.|Black jeans|truck|68/)
  })
  it('shows a member holding the public role besides none of it either, as its page shows none', () => {
    const b = buildBriefing(input({ viewer: { uid: 'me', roles: ['regular', 'public'] } }))
    expect(b.today.map((e) => e.chips)).toEqual([[], []])
    expect(b.spoken).not.toMatch(/Worship\.|Black jeans|truck|68/)
  })
  it('shows an admin holding the public role all of it, as they open and edit every event', () => {
    const b = buildBriefing(input({ viewer: { uid: 'me', roles: ['admin', 'public'] } }))
    expect(b.spoken).toMatch(/68/)
  })
  it('says it in order', () => {
    const { spoken } = buildBriefing(input())
    expect(spoken).toContain('Good morning, Jacob. Today is Sunday, October 18.')
    expect(spoken).toContain('You have 2 events today.')
    expect(spoken).toContain("Sunday Service at 10:00 AM, at The Well. You're on Worship.")
    expect(spoken).toContain('One task is overdue: Book the bus. Due today: Print flyers.')
    expect(spoken).toContain('Reminders today: go to Costco at 5 PM.')
    expect(spoken).toContain('You have 4 unread messages.')
  })
  it('on a quiet day, gives what’s next', () => {
    const b = buildBriefing(
      input({
        now: new Date(2026, 9, 20, 13, 0),
        tasks: [],
        reminders: [],
        announcements: [],
        unread: [],
      })
    )
    expect(b.greeting).toBe('Good afternoon, Jacob')
    expect(b.today).toEqual([])
    expect(b.next?.title).toBe('Youth Retreat')
    expect(b.dateLine).toBe('Tuesday, October 20 · You’re caught up')
    expect(b.spoken).toContain('Nothing on today. Next up is Youth Retreat, Friday.')
  })
})

describe('asking for it', () => {
  it('hears the ways it’s asked', () => {
    for (const said of [
      'What do I need to know today?',
      'brief me',
      'my briefing',
      'daily briefing',
      'how does my day look',
      "what's my day look like",
      'good morning',
      'catch me up',
    ]) {
      expect(briefingAsked(said), said).toBe(true)
    }
    expect(briefingAsked('what do I need to bring to revival')).toBe(false)
    expect(briefingAsked('good morning sunshine')).toBe(false)
  })

  it('hears it typed in a hurry, or heard a little wrong', () => {
    for (const said of [
      'Gibe me my daily breifing',
      'give me my daily briefng',
      'my dialy briefing',
      'breif me',
      'good mornin',
    ]) {
      expect(briefingAsked(said), said).toBe(true)
    }
    // Close words that are something else are not read as it.
    expect(briefingAsked('bring me my daily bread')).toBe(false)
  })
})

describe('said one part at a time', () => {
  it('says the same words, each part with the rows it is about, in order', () => {
    const b = buildBriefing(input())
    expect(b.segments.map((x) => x.text).join(' ')).toBe(b.spoken)
    expect(b.segments[0]).toEqual({ ids: ['head'], text: expect.stringMatching(/^Good morning/) })
    const order = b.segments.flatMap((x) => x.ids)
    // Events, then tasks, then reminders, then news: as the screen lists them.
    const first = (prefix: string) => order.findIndex((id) => id.startsWith(prefix))
    expect(first('ev:')).toBeGreaterThan(0)
    expect(first('task:')).toBeGreaterThan(first('ev:'))
    expect(first('rem:')).toBeGreaterThan(first('task:'))
    expect(first('news:')).toBeGreaterThan(first('rem:'))
    // Overdue first, then due today: each its own part.
    const overdue = b.segments.find((x) => x.text.startsWith('One task is overdue'))
    expect(overdue?.ids).toEqual(
      b.tasks.filter((t) => t.due === 'overdue').map((t) => `task:${t.id}`)
    )
  })
})

describe('food still open', () => {
  it('names the event and suggests an item', () => {
    const b = buildBriefing(
      input({
        food: [
          {
            eventKey: 'ret_2026-10-23',
            title: 'Youth Retreat',
            date: '2026-10-23',
            open: ['Chips', 'Cups'],
            suggestion: 'Chips',
          },
        ],
      })
    )
    expect(b.food.map((f) => f.suggestion)).toEqual(['Chips'])
    expect(b.needs).toBe(4)
    expect(b.spoken).toContain(
      'Youth Retreat Friday still has open food items. How about bringing chips?'
    )
  })
  it('suggests none to anyone holding the public role, whose event pages show no food sheet', () => {
    const b = buildBriefing(
      input({
        viewer: { uid: 'me', roles: ['regular', 'public'] },
        food: [
          {
            eventKey: 'ret_2026-10-23',
            title: 'Youth Retreat',
            date: '2026-10-23',
            open: ['Chips', 'Cups'],
            suggestion: 'Chips',
          },
        ],
      })
    )
    expect(b.food).toEqual([])
    expect(b.spoken).not.toMatch(/food|chips/i)
  })
})

describe('the briefing, of birthdays, anniversaries and teams', () => {
  it('reminds them to wish those whose birthday or anniversary is this week', () => {
    const b = buildBriefing(
      input({
        occasions: [
          { id: 'w', kind: 'birthday', people: [{ name: 'Whitney Slattery' }], month: 10, day: 18 },
          {
            id: 'a',
            kind: 'anniversary',
            people: [{ name: 'Josh Slattery' }, { name: 'Whitney Slattery' }],
            month: 10,
            day: 21,
          },
          // Too far off to say.
          { id: 'x', kind: 'birthday', people: [{ name: 'Later Person' }], month: 12, day: 1 },
        ],
      })
    )
    expect(b.occasions.map((o) => o.title)).toEqual([
      'Whitney Slattery’s birthday',
      'Josh and Whitney Slattery’s anniversary',
    ])
    expect(b.spoken).toContain(
      'Today is Whitney Slattery’s birthday — wish Whitney a happy birthday!'
    )
    expect(b.spoken).toContain(
      'Josh and Whitney Slattery’s anniversary is Wednesday — wish Josh and Whitney a happy anniversary!'
    )
    expect(b.segments.some((s) => s.ids.includes('occ:w_2026-10-18'))).toBe(true)
  })

  it('says every team they’re on', () => {
    const many = templates.map((t) =>
      t.id === 'sun'
        ? {
            ...t,
            teams: [
              { name: 'Worship', leaders: [], members: ['me'] },
              { name: 'Setup', leaders: ['me'], members: [] },
            ],
          }
        : t
    )
    const b = buildBriefing(input({ templates: many as never }))
    expect(b.today[0].chips).toEqual(expect.arrayContaining(['Worship team', 'Setup team']))
    expect(b.spoken).toContain('You’re on Worship and Setup.'.replace('’', "'"))
  })

  it('gives when to be there, to those on the event', () => {
    const timed = templates.map((t) =>
      t.id === 'sun'
        ? {
            ...t,
            reportTimes: [
              { group: 'Worship', time: '8:30 AM' },
              { group: '_remainder_', time: '9:30 AM' },
            ],
          }
        : t
    )
    const b = buildBriefing(input({ templates: timed as never }))
    expect(b.today[0].chips).toContain('Report 8:30 AM')
    expect(b.spoken).toContain('Report at 8:30 AM.')
    // Not someone who isn't on it, though they can see it.
    const pub = timed.map((t) => (t.id === 'sun' ? { ...t, isPublic: true, users: [] } : t))
    const other = buildBriefing(
      input({ templates: pub as never, viewer: { uid: 'kim', roles: ['regular'] } })
    )
    expect(other.today.flatMap((e) => e.chips).join()).not.toMatch(/Report/)
    expect(other.spoken).not.toMatch(/Report/)
  })
})
