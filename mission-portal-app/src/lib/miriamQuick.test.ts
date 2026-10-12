import { describe, expect, it } from 'vitest'
import {
  availabilityAsked,
  availabilityEvent,
  listAnswer,
  listAsked,
  playAsked,
  playPick,
  quickAnswer,
  quickAsked,
  screenAsked,
  tasksAnswer,
  tasksAsked,
  weatherLine,
  type QuickData,
} from './miriamQuick'

const today = '2026-10-11' // a Sunday
const templates = [
  {
    id: 'rev',
    title: 'Revival in the Heartland',
    date: today,
    startTime: '5 PM',
    location: 'Xtreme Arena',
    city: 'Wichita',
    state: 'KS',
    _geocodeLat: 37.69,
    _geocodeLng: -97.34,
    users: ['me', 'sam'],
    teams: [{ name: 'Worship', leaders: [], members: ['me'] }],
    dressCode: [
      { group: 'Worship', text: 'all black' },
      { group: '_remainder_', text: 'a mission shirt' },
    ],
  },
  { id: 'sun', title: 'Sunday Service', isRec: true, recDay: 0, recur: 'weekly', isPublic: true },
  {
    id: 'ret',
    title: 'Youth Retreat',
    date: '2026-10-16',
    startTime: '8 AM',
    users: ['me'],
    carpool: true,
    carpoolCars: [{ label: 'Van', driver: 'sam', riders: ['me'] }],
    lodging: true,
    lodgingEntries: [{ name: 'Lakeside Inn', address: '1 Lake Rd', room: '12', assignees: ['me'] }],
  },
  { id: 'draft', title: 'Secret Planning', date: today, users: ['me'], unpublished: true },
]
const data = (uid = 'me', roles = ['regular']): QuickData => ({
  templates: templates as never,
  overrides: {},
  groups: [],
  viewer: { uid, roles },
  names: new Map([
    ['me', 'Jacob'],
    ['sam', 'Sam'],
  ]),
  today,
})

describe('event questions answered on the device', () => {
  it('gives your own dress code for each event today', () => {
    const a = quickAnswer('What am I wearing today', data())
    expect(a?.text).toBe(
      'Revival in the Heartland: all black. Sunday Service has no dress code set.'
    )
    expect(a?.open).toBeNull()
  })

  it('answers about one event by name, and opens it at what was asked', () => {
    expect(quickAnswer('What’s the dress code for Revival?', data())).toEqual({
      text: 'The dress code for Revival in the Heartland is all black.',
      open: { key: 'rev_2026-10-11', section: 'dress_code' },
    })
    // Not on the Worship team: what everyone else wears.
    expect(quickAnswer('dress code for revival', data('sam'))?.text).toBe(
      'The dress code for Revival in the Heartland is a mission shirt.'
    )
  })

  it('tells when, where, and your car and room', () => {
    expect(quickAnswer('When is Revival', data())?.text).toBe(
      'Revival in the Heartland is today at 5 PM.'
    )
    expect(quickAnswer('Where is revival in the heartland', data())?.text).toBe(
      'Revival in the Heartland is at Xtreme Arena, Wichita, KS.'
    )
    expect(quickAnswer('Who’s in my car for the youth retreat?', data())?.text).toBe(
      'Youth Retreat: Van (your car): driven by Sam, riding: Jacob.'
    )
    expect(quickAnswer('Where am I staying for the retreat', data())?.text).toBe(
      'Youth Retreat: Lakeside Inn (yours): 1 Lake Rd, room 12.'
    )
    expect(quickAnswer('When is the youth retreat', data())?.text).toBe(
      'Youth Retreat is on Friday, Oct 16 at 8 AM.'
    )
  })

  it('never answers about an event the person can’t see', () => {
    expect(quickAnswer('dress code for secret planning', data())).toBeNull()
  })

  it('leaves to Claude what it can’t answer plainly', () => {
    for (const said of [
      'What’s the dress code', // which event?
      'Who isn’t available for Revival',
      'What should I wear to the gala', // no such event
      'What are my tasks',
    ]) {
      expect(quickAnswer(said, data()), said).toBeNull()
    }
  })

  it('works out the day asked about', () => {
    expect(quickAsked('what time is service tomorrow', today)?.date).toBe('2026-10-12')
    expect(quickAsked('what am I wearing friday', today)?.date).toBe('2026-10-16')
    expect(quickAsked('what am I wearing sunday', today)?.date).toBe(today)
    expect(quickAsked('what am I wearing next sunday', today)?.date).toBe('2026-10-18')
  })
})

describe('screens asked for by name', () => {
  const screens = [
    { id: 'events', label: 'Events' },
    { id: 'settings', label: 'Profile & Settings' },
    { id: 'messages', label: 'Messages' },
    { id: 'assignments', label: 'Assignments (tasks)' },
  ]
  it('goes to a screen this person has', () => {
    expect(screenAsked('Open settings', screens)).toBe('settings')
    expect(screenAsked('Hey Miriam, take me to my messages', screens)).toBe('messages')
    expect(screenAsked('go to the calendar', screens)).toBe('events')
    expect(screenAsked('show me my tasks', screens)).toBe('assignments')
    expect(screenAsked('open profile & settings', screens)).toBe('settings')
  })
  it('leaves songs, other people’s screens and questions alone', () => {
    expect(screenAsked('open Above All', screens)).toBeNull()
    expect(screenAsked('open the admin panel', screens)).toBeNull()
    expect(screenAsked('what are my tasks', screens)).toBeNull()
  })
})

describe('the weather for an event', () => {
  it('names the events to fetch a forecast for, and opens the one', () => {
    const a = quickAnswer('Is it going to rain at Revival', data())
    expect(a?.weather?.map((e) => e.title)).toEqual(['Revival in the Heartland'])
    expect(a?.open).toEqual({ key: 'rev_2026-10-11', section: 'weather' })
    expect(quickAnswer('what’s the weather for the retreat', data())?.weather?.length).toBe(1)
  })
  it('says the forecast, or why there is none', () => {
    const [rev] = quickAnswer('weather at revival', data())!.weather!
    expect(weatherLine(rev, { high: 71.6, low: 50, precipPct: 40, label: 'Showers' }, today)).toBe(
      'Revival in the Heartland today: showers, high 72°, low 50°, 40% chance of rain.'
    )
    expect(weatherLine(rev, null, today)).toBe(
      'There’s no forecast yet for Revival in the Heartland today.'
    )
    const [ret] = quickAnswer('weather at the retreat', data())!.weather!
    expect(weatherLine(ret, null, today)).toBe(
      'Youth Retreat has no forecast: no place is set for it.'
    )
  })
})

describe('what’s coming up', () => {
  it('gives your next event', () => {
    const ask = listAsked("What's my next event?", today)!
    expect(ask.next).toBe(true)
    expect(listAnswer(ask, data())).toEqual({
      text: 'Your next event is Revival in the Heartland, today at 5 PM.',
      open: { key: 'rev_2026-10-11', section: 'details' },
    })
  })
  it('lists what’s on, and only what this person can see', () => {
    const ask = listAsked('what’s on this week', today)!
    expect(ask).toMatchObject({ from: today, to: '2026-10-17' })
    expect(listAnswer(ask, data()).text).toBe(
      'On this week: Revival in the Heartland, today at 5 PM; Sunday Service, today; Youth Retreat, Friday at 8 AM.'
    )
    expect(listAnswer(listAsked('what do I have tomorrow', today)!, data()).text).toBe(
      'Nothing is on tomorrow.'
    )
    expect(listAsked('what’s on next week', today)).toMatchObject({
      from: '2026-10-18',
      to: '2026-10-24',
    })
  })
  it('leaves other questions alone', () => {
    expect(listAsked('what’s the dress code for revival', today)).toBeNull()
    expect(listAsked('who is available this week', today)).toBeNull()
  })
})

describe('your tasks', () => {
  const tasks = [
    { id: 1, title: 'Book the bus', status: 'pending', dueDate: '2026-10-09', assignees: ['me'] },
    { id: 2, title: 'Print flyers', status: 'in_progress', dueDate: today, assignees: ['me'] },
    {
      id: 3,
      title: 'Order shirts',
      status: 'pending',
      dueDate: '2026-10-14',
      assignees: ['sam'],
      lead: 'me',
    },
    { id: 4, title: 'Call venue', status: 'done', dueDate: today, assignees: ['me'] },
    { id: 5, title: 'Sam’s own', status: 'pending', dueDate: today, assignees: ['sam'] },
    { id: 6, title: 'Pack', status: 'pending', dueDate: '2026-11-01', assignees: ['me'] },
  ]
  it('hears what is asked', () => {
    expect(tasksAsked('What are my tasks')).toBe('open')
    expect(tasksAsked("what's due today")).toBe('today')
    expect(tasksAsked('What is due this week?')).toBe('week')
    expect(tasksAsked('do I have anything overdue')).toBe('overdue')
    expect(tasksAsked('what are everyone’s tasks')).toBeNull()
    expect(tasksAsked('what’s the dress code')).toBeNull()
  })
  it('gives only their own, not done, soonest first', () => {
    expect(tasksAnswer('open', tasks, 'me', today).text).toBe(
      'You have 4 tasks: Book the bus (overdue); Print flyers (due today); Order shirts (due Wed, Oct 14); Pack (due Sun, Nov 1).'
    )
    expect(tasksAnswer('today', tasks, 'me', today).text).toBe(
      'You have 1 task due today: Print flyers (due today).'
    )
    expect(tasksAnswer('overdue', tasks, 'sam', today).text).toBe('Nothing of yours is overdue.')
  })
})

describe('playing from Content', () => {
  const items = [
    {
      id: 'a',
      type: 'sermon',
      title: 'Faith Over Fear',
      preacher: 'Pastor Dan',
      year: 2026,
      month: 9,
    },
    {
      id: 'b',
      type: 'sermon',
      title: 'The Good Shepherd',
      preacher: 'Pastor Amy',
      year: 2026,
      month: 10,
    },
    { id: 'c', type: 'podcast', title: 'Kenya Stories', host: 'Jo', year: 2026, month: 8 },
    { id: 'd', type: 'music', title: 'Above All', year: 2025 },
  ]
  it('plays the newest sermon, or the one named', () => {
    expect(playPick(playAsked('Play the sermon from Sunday')!, items)?.id).toBe('b')
    expect(playPick(playAsked('play the latest podcast')!, items)?.id).toBe('c')
    expect(playPick(playAsked('play the faith over fear sermon')!, items)?.id).toBe('a')
    expect(playPick(playAsked('play pastor dan’s sermon')!, items)?.id).toBe('a')
  })
  it('leaves songs to the chord sheets, and a vague ask to Claude', () => {
    expect(playAsked('play Above All')).toBeNull()
    expect(playPick(playAsked('play a sermon')!, items)).toBeNull()
  })
})

describe('giving availability', () => {
  it('hears the answer and the event', () => {
    expect(availabilityAsked('I’m available for Revival', today)).toEqual({
      status: 'yes',
      date: null,
      name: 'revival',
    })
    expect(availabilityAsked("I can't make it Friday", today)).toMatchObject({
      status: 'no',
      date: '2026-10-16',
    })
    expect(availabilityAsked('not sure about the youth retreat', today)?.status).toBe('tbd')
    expect(availabilityAsked('count me out for the retreat', today)?.status).toBe('no')
  })
  it('finds the one event, or leaves it to Claude', () => {
    const ev = availabilityEvent(availabilityAsked('I’m available for Revival', today)!, data())
    expect(ev?.instanceKey).toBe('rev_2026-10-11')
    expect(availabilityAsked('am I available for revival?', today)).toBeNull()
    expect(availabilityAsked('I’m available', today)).toBeNull()
    expect(availabilityAsked('Who is available for revival', today)).toBeNull()
  })
})
