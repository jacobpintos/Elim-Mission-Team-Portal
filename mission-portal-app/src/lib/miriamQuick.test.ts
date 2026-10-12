import { describe, expect, it } from 'vitest'
import { quickAnswer, quickAsked, screenAsked, type QuickData } from './miriamQuick'

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
      'Is it going to rain at Revival', // the weather is looked up by the server
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
