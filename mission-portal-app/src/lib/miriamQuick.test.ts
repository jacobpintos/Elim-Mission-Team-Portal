import { describe, expect, it } from 'vitest'
import { onceEach } from '../../functions/src/miriam/data'
import {
  availabilityAsked,
  availabilityEvent,
  listAnswer,
  listAsked,
  playAsked,
  playCandidates,
  playPick,
  playFits,
  playKey,
  nearWord,
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
  it('gives your own dress code today — of the events you’re on', () => {
    const a = quickAnswer('What am I wearing today', data())
    expect(a?.text).toBe('The dress code for Revival in the Heartland is all black.')
    expect(a?.open).toEqual({ key: 'rev_2026-10-11', section: 'dress_code' })
  })

  it('keeps an event’s private side to those on it', () => {
    // Sunday Service is public; they aren't on it.
    expect(quickAnswer('dress code for sunday service', data())?.text).toBe(
      'That’s only for those on Sunday Service — but I can tell you when and where it is.'
    )
    expect(quickAnswer('what team am I on for sunday service', data())?.text).toBe(
      'You’re not on Sunday Service.'
    )
    expect(quickAnswer('when is sunday service', data())?.text).toMatch(/^Sunday Service is today/)
    // An admin is given it, on it or not.
    expect(quickAnswer('dress code for sunday service', data('boss', ['admin']))?.text).toBe(
      'Sunday Service has no dress code set.'
    )
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
      'Youth Retreat: Van (your car): driven by Sam, riding: you.'
    )
    expect(quickAnswer('Where am I staying for the retreat', data())?.text).toBe(
      'Youth Retreat: Lakeside Inn (yours): 1 Lake Rd, room 12.'
    )
    expect(quickAnswer('When is the youth retreat', data())?.text).toBe(
      'Youth Retreat is on Friday, Oct 16 at 8 AM.'
    )
  })

  it('where it is, asked on its day: maps offered for it', () => {
    expect(quickAnswer('Where is revival in the heartland', data())?.directions?.instanceKey).toBe(
      'rev_2026-10-11'
    )
    // The day before: just where.
    const before = quickAnswer('Where is revival in the heartland', {
      ...data(),
      today: '2026-10-10',
    })
    expect(before?.text).toBe('Revival in the Heartland is at Xtreme Arena, Wichita, KS.')
    expect(before?.directions).toBeUndefined()
    // Nowhere set: nothing to open maps to.
    expect(quickAnswer('Where is the youth retreat', data())?.directions).toBeUndefined()
    // Not asked where.
    expect(quickAnswer('When is Revival', data())?.directions).toBeUndefined()
  })

  it('tells a public follower none of an event’s team side, as its page shows them none', () => {
    const pub = data('me', ['public'])
    for (const q of [
      'what’s the dress code for revival in the heartland',
      'who am I riding with to the youth retreat',
      'where am I staying for the youth retreat',
      'what team am I on for revival in the heartland',
    ]) {
      expect([q, quickAnswer(q, pub)?.text]).toEqual([
        q,
        expect.stringMatching(
          /^Sorry, I can’t help with that one — but I can tell you when and where .+ is\.$/
        ),
      ])
    }
    expect(quickAnswer('what’s the weather for revival in the heartland', pub)?.weather).toBe(
      undefined
    )
    // When and where, as anyone who can open it sees.
    expect(quickAnswer('when is revival in the heartland', pub)?.text).toMatch(/5 PM/)
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

describe('an event’s schedule', () => {
  const camp = {
    id: 'camp',
    title: 'Family Camp',
    date: '2026-10-16',
    extraDays: [{ date: '2026-10-17' }],
    users: ['me'],
    schedule: [
      { id: 'a', time: '7:00 PM', title: 'Worship', notes: 'Main hall' },
      { id: 'b', time: '9:00 AM', endTime: '11:00 AM', title: 'Hike', day: 1 },
    ],
  }
  const withCamp = (): QuickData => ({ ...data(), templates: [...templates, camp] as never })

  it('reads it out, by day for a multi-day event, and opens the event at it', () => {
    expect(quickAnswer('What’s the schedule for family camp?', withCamp())).toEqual({
      text: 'The schedule for Family Camp — Friday: 7:00 PM, Worship (Main hall). Saturday: 9:00–11:00 AM, Hike.',
      open: { key: 'camp_2026-10-16', section: 'schedule' },
    })
    expect(quickAnswer('itinerary for family camp', withCamp())?.text).toContain('Saturday:')
  })

  it('says so when an event has none', () => {
    expect(quickAnswer('what’s the schedule for revival', data())?.text).toBe(
      'Revival in the Heartland has no schedule yet.'
    )
  })

  it('the time of something on it, not the event’s own — by its day, for a multi-day event', () => {
    expect(quickAnswer('what time is worship at family camp', withCamp())).toEqual({
      text: 'On the Family Camp schedule, “Worship” is on Friday at 7:00 PM.',
      open: { key: 'camp_2026-10-16', section: 'schedule' },
    })
    expect(quickAnswer('when is the hike at family camp?', withCamp())?.text).toBe(
      'On the Family Camp schedule, “Hike” is on Saturday, 9:00–11:00 AM.'
    )
    expect(quickAnswer('what’s the schedule for the hike at family camp', withCamp())?.text).toBe(
      'On the Family Camp schedule, “Hike” is on Saturday, 9:00–11:00 AM.'
    )
    // The event itself, asked by its name alone.
    expect(quickAnswer('when is family camp', withCamp())?.text).toBe(
      'Family Camp is on Friday, Oct 16; no time is set.'
    )
  })

  it('leaves to her what isn’t on it, and what comes before or after something', () => {
    for (const said of [
      'what time is dinner at family camp',
      'what’s on the schedule after worship at family camp',
      'what time is the hike before worship at family camp',
    ]) {
      expect(quickAnswer(said, withCamp()), said).toBeNull()
    }
    // Asked for the whole schedule, with something not on it: all of it.
    expect(
      quickAnswer('what’s the schedule for dinner at family camp', withCamp())?.text
    ).toContain('The schedule for Family Camp')
  })

  it('keeps it from a public follower, as the event’s page does', () => {
    const pub = { ...data('me', ['public']), templates: [...templates, camp] as never }
    expect(quickAnswer('What’s the schedule for family camp?', pub)?.text).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where Family Camp is.'
    )
    expect(quickAnswer('when is worship at family camp', pub)?.text ?? '').not.toContain('Worship')
  })

  it('keeps “my schedule this week” for their week, and “my schedule for camp” for the event', () => {
    expect(listAsked('what’s my schedule this week', today)).not.toBeNull()
    expect(listAsked('what’s my schedule for family camp', today)).toBeNull()
    expect(quickAnswer('what’s my schedule for family camp', withCamp())?.text).toContain('Worship')
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
    // Their tasks, not their events.
    expect(listAsked('what do I have to do this week', today)).toBeNull()
    // "Have next" is the next event — unless it is next week.
    expect(listAsked('what do I have next', today)?.next).toBe(true)
    expect(listAsked('what do I have next week', today)).toMatchObject({
      next: false,
      from: '2026-10-18',
    })
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

describe('someone else’s flight or lodging', () => {
  it('is never the event’s time or place — left to be looked up', () => {
    for (const q of [
      'For the new years eve event, what time is Guest User’s flight arriving',
      'where is guest user staying for new years eve',
      'when does Sam’s flight land',
      'is jacob driving to the retreat',
      'what time should I arrive at the retreat',
    ]) {
      expect(quickAsked(q, today), q).toBeNull()
    }
  })

  it('but their own is answered here', () => {
    expect(quickAsked('where am I staying for the retreat', today)?.field).toBe('lodging')
    expect(quickAsked('when does my flight land for the retreat', today)?.field).toBe('flight')
    expect(quickAsked('where is the retreat', today)?.field).toBe('place')
    expect(quickAsked('what time is the retreat', today)?.field).toBe('time')
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
  it('plays a video by its title: "play" is always for Content', () => {
    const videos = [
      ...items,
      { id: 'r1', type: 'music', title: 'Revive Me', year: 2024 },
      { id: 'r2', type: 'music', title: 'Revive Us Again', year: 2026 },
      { id: 't', type: 'music', title: '10,000 Reasons (Live)', year: 2023 },
    ]
    expect(playPick(playAsked('Play Revive Me')!, videos)?.id).toBe('r1')
    expect(playPick(playAsked('play above all')!, videos)?.id).toBe('d')
    expect(playPick(playAsked('open the Revive Me video')!, videos)?.id).toBe('r1')
    expect(playPick(playAsked('show me the video revive us again')!, videos)?.id).toBe('r2')
    expect(playPick(playAsked('watch revive me')!, videos)?.id).toBe('r1')
    expect(playPick(playAsked('play 10,000 reasons')!, videos)?.id).toBe('t')
    // Not plain which: left to Claude, which can look further.
    expect(playPick(playAsked('play revive')!, videos)).toBeNull()
    expect(playPick(playAsked('play a sermon')!, items)).toBeNull()
  })
  it('leaves chord sheets to "open", and queueing to the sheet', () => {
    expect(playAsked('open Revive Me')).toBeNull()
    expect(playAsked('open above all in E')).toBeNull()
    expect(playAsked('play Above All next')).toBeNull()
    expect(playAsked('play next Above All')).toBeNull()
  })
  const videos = [
    ...items,
    { id: 'r1', type: 'music', title: 'Revive Me', year: 2024 },
    { id: 'r2', type: 'music', title: 'Revive Us Again', year: 2026 },
    { id: 'm', type: 'music', title: 'A Mighty Fortress', year: 2022 },
  ]
  it('"open" a video, where no chord sheet could be meant — by its whole title only', () => {
    const opened = (text: string) => playAsked(text, { openAny: true })
    expect(playPick(opened('open Revive Me')!, videos, { exact: true })?.id).toBe('r1')
    expect(playPick(opened('pull up revive us again')!, videos, { exact: true })?.id).toBe('r2')
    expect(playPick(opened('show me the good shepherd')!, videos, { exact: true })?.id).toBe('b')
    // "Open" means much else: nothing near enough is a video.
    expect(playPick(opened('open revive')!, videos, { exact: true })).toBeNull()
    expect(playPick(opened('open settings')!, videos, { exact: true })).toBeNull()
    expect(playPick(opened('show me what’s on this week')!, videos, { exact: true })).toBeNull()
  })
  it('offers the likely ones, when none is plainly it', () => {
    const ids = (text: string, list = videos) =>
      playCandidates(playAsked(text)!, list).map((v) => v.id)
    expect(ids('play revive')).toEqual(['r2', 'r1'])
    expect(ids('play a sermon')).toEqual(['b', 'a'])
    expect(ids('play the kenya one')).toEqual(['c'])
    expect(ids('play pastor amy')).toEqual(['b'])
    // Nothing like it: none — not "A Mighty Fortress" for "amazing".
    expect(ids('play amazing grace')).toEqual([])
    expect(ids('play something by nobody')).toEqual([])
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

describe('playing what was described, not named', () => {
  const flip = [
    {
      id: 'ou',
      type: 'podcast',
      title: 'Oneness Vs Unity',
      album: 'Flip The Narrative',
      guest: 'Pastor Scott Reece',
      year: 2026,
      month: 9,
    },
    {
      id: 'fo',
      type: 'podcast',
      title: 'Forgiveness',
      album: 'Flip The Narrative',
      guest: 'Amy Lee',
      year: 2026,
      month: 10,
    },
    {
      id: 'sr',
      type: 'sermon',
      title: 'Rest',
      preacher: 'Scott Reece',
      year: 2026,
      month: 8,
    },
  ]
  const pick = (text: string) => playPick(playAsked(text)!, flip)?.id ?? null

  it('plays a podcast by its series and guest, as heard', () => {
    expect(pick('Play the flip the narrative podcast with Scott Reese')).toBe('ou')
    expect(pick('play the flip the narrative episode featuring pastor scott reece')).toBe('ou')
    expect(pick('play the podcast with amy lee')).toBe('fo')
  })

  it('takes the kind asked for: Scott’s sermon, not his podcast', () => {
    expect(pick('play the sermon by scott reese')).toBe('sr')
  })

  it('offers those that fit, when the description fits more than one', () => {
    const ask = playAsked('play the flip the narrative podcast')!
    expect(playPick(ask, flip)).toBeNull()
    expect(playFits(ask, flip).map((m) => m.id)).toEqual(['ou', 'fo'])
  })

  it('hears a name one letter off, but not a short word', () => {
    expect(nearWord('reese', 'reece')).toBe(true)
    expect(nearWord('sheperd', 'shepherd')).toBe(true)
    expect(nearWord('narr', 'narrative')).toBe(true)
    expect(nearWord('pray', 'play')).toBe(false)
    expect(nearWord('grace', 'peace')).toBe(false)
  })

  it('keeps one key for the same request, to remember what it meant', () => {
    expect(playKey(playAsked('Play the flip the narrative podcast with Scott Reese')!)).toBe(
      playKey(playAsked('play flip the narrative podcast with scott reese please')!)
    )
  })
})

describe('teams, when someone is on several', () => {
  const day = '2026-10-11'
  const tmpl = [
    {
      id: 'out',
      title: 'Outreach Night',
      date: '2026-10-16',
      users: ['me', 'sam', 'lee'],
      teams: [
        { name: 'Worship', leaders: ['me'], members: ['sam'] },
        { name: 'Setup Team', leaders: [], members: ['me', 'sam'] },
        { name: 'Greeters', leaders: [], members: ['lee'] },
      ],
      dressCode: [
        { group: 'Worship', text: 'all black' },
        { group: 'Setup Team', text: 'work clothes' },
        { group: '_remainder_', text: 'a mission shirt' },
      ],
    },
    {
      id: 'camp',
      title: 'Fall Camp',
      date: '2026-11-07',
      users: ['me', 'sam'],
      teams: [{ name: 'Kitchen', leaders: [], members: ['sam'] }],
    },
  ]
  const as = (uid: string, roles = ['regular']): QuickData => ({
    templates: tmpl as never,
    overrides: {},
    groups: [],
    viewer: { uid, roles },
    names: new Map([
      ['me', 'Jacob Pintos'],
      ['sam', 'Sunny Singh'],
      ['lee', 'Lee Park'],
    ]),
    today: day,
  })

  it('says every team you’re on', () => {
    expect(quickAnswer('what team am I on for outreach night', as('me'))?.text).toBe(
      'You’re on the Worship and Setup teams for Outreach Night.'
    )
    expect(quickAnswer('what team am I on for outreach night', as('lee'))?.text).toBe(
      'You’re on the Greeters team for Outreach Night.'
    )
  })

  it('gives each of your teams’ dress codes', () => {
    expect(quickAnswer('dress code for outreach night', as('me'))?.text).toBe(
      'The dress code for Outreach Night is Worship: all black; Setup Team: work clothes.'
    )
  })

  it('answers about someone else by name, never with your own team', () => {
    expect(quickAnswer('what team is Sunny on', as('me', ['admin']))?.text).toBe(
      'Sunny Singh is on the Worship and Setup teams for Outreach Night (Friday, Oct 16), and the Kitchen team for Fall Camp (Saturday, Nov 7).'
    )
    expect(quickAnswer('which team is sunny on for fall camp', as('me'))).toEqual({
      text: 'Sunny Singh is on the Kitchen team for Fall Camp.',
      open: { key: 'camp_2026-11-07', section: 'details' },
    })
    expect(quickAnswer("what's Lee's team for outreach night", as('me'))?.text).toBe(
      'Lee Park is on the Greeters team for Outreach Night.'
    )
    expect(quickAnswer('is lee on a team for fall camp', as('me'))?.text).toBe(
      'Lee Park isn’t on a team for Fall Camp.'
    )
    // Not someone it can tell: left to Claude, not answered as yours.
    expect(quickAnswer('what team is Whitney on', as('me'))).toBeNull()
    // Never a public follower's to be told.
    expect(quickAnswer('what team is Sunny on', as('lee', ['public']))).toBeNull()
  })
})

describe('church, asked of Miriam', () => {
  const day = '2026-10-27' // a Tuesday
  const tmpl = [
    {
      id: 'sun',
      title: 'Sunday Service',
      isRec: true,
      recDay: 0,
      recur: 'weekly',
      date: '2026-01-04',
      startTime: '10:00 AM',
      location: 'The Well',
      isPublic: true,
    },
    // Past, at a venue called "… Church": never what "church" means.
    {
      id: 'rally',
      title: 'Worship Rally',
      date: '2026-10-10',
      location: 'River City Church',
      isPublic: true,
    },
  ]
  const data: QuickData = {
    templates: tmpl as never,
    overrides: {},
    groups: [],
    viewer: { uid: 'me', roles: ['regular'] },
    names: new Map(),
    today: day,
  }

  it('is the weekly Sunday service, next', () => {
    expect(quickAnswer('when is church', data)?.text).toBe(
      'Sunday Service is on Sunday, Nov 1 at 10:00 AM.'
    )
    expect(quickAnswer('what time is church', data)?.text).toBe(
      'Sunday Service is on Sunday, Nov 1 at 10:00 AM.'
    )
    expect(quickAnswer('where is church', data)?.text).toBe('Sunday Service is at The Well.')
  })

  it('still finds an event by its venue when the venue is named', () => {
    expect(quickAnswer('when is the event at river city church', data)?.text).toMatch(
      /^Worship Rally is/
    )
  })
})

describe('what is coming up, over a stretch of days', () => {
  it('lists every event in the stretch asked about, not just the next', () => {
    expect(listAsked('What is coming up in the next 30 days', today)).toEqual({
      next: false,
      from: today,
      to: '2026-11-09',
      span: 'in the next 30 days',
    })
    expect(
      listAnswer(listAsked('What is coming up in the next 30 days', today)!, data()).text
    ).toBe(
      // A repeating event once, with how often.
      'In the next 30 days: Revival in the Heartland, today at 5 PM; Sunday Service, every Sunday; Youth Retreat, Friday at 8 AM.'
    )
  })

  it('reads the week and the month ahead, and so many days or weeks', () => {
    expect(listAsked('how does my upcoming week look', today)).toMatchObject({
      from: today,
      to: '2026-10-17',
      span: 'in the week ahead',
    })
    expect(listAsked('tell me about my upcoming month', today)).toMatchObject({
      from: today,
      to: '2026-11-09',
      span: 'in the month ahead',
    })
    expect(listAsked('what do I have in the next two weeks', today)).toMatchObject({
      to: '2026-10-24',
      span: 'in the next two weeks',
    })
    expect(listAsked('what’s on next month', today)).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      span: 'next month',
    })
  })

  it('lists what is coming up with no stretch said; the next one only when asked for', () => {
    expect(listAsked('what’s coming up', today)).toMatchObject({
      next: false,
      span: 'in the next 30 days',
    })
    expect(listAsked('what is my next event', today)?.next).toBe(true)
    expect(listAsked('what’s next', today)?.next).toBe(true)
  })
})

describe('a repeating event, listed once', () => {
  const ev = (over: Record<string, unknown>) =>
    ({ id: 'x', templateId: 'x', instanceKey: 'x', title: 'X', ...over }) as never
  const titled = (list: { ev: unknown; every: string | null }[]) =>
    list.map((x) => `${(x.ev as { title: string }).title}: ${x.every ?? 'once'}`)

  it('says how often, with its time when every one starts then', () => {
    const weekly = ['2026-10-11', '2026-10-18', '2026-10-25'].map((date) =>
      ev({
        templateId: 'sun',
        instanceKey: `sun_${date}`,
        title: 'Sunday Service',
        date,
        isRec: true,
        recur: 'weekly',
        startTime: '10:00 AM',
      })
    )
    const other = ['2026-10-13', '2026-10-27'].map((date) =>
      ev({
        templateId: 'bible',
        instanceKey: `bible_${date}`,
        title: 'Bible Study',
        date,
        isRec: true,
        recur: 'biweekly',
        startTime: '7 PM',
      })
    )
    const once = ev({
      templateId: 'ret',
      instanceKey: 'ret_2026-10-16',
      title: 'Retreat',
      date: '2026-10-16',
    })
    const list = [...weekly, ...other, once].sort((a: { date: string }, b: { date: string }) =>
      a.date.localeCompare(b.date)
    )
    expect(titled(onceEach(list))).toEqual([
      'Sunday Service: every Sunday at 10:00 AM',
      'Bible Study: every other Tuesday at 7 PM',
      'Retreat: once',
    ])
    // Coming round once in the stretch: its own date, as a one-off is.
    expect(titled(onceEach([weekly[0]]))).toEqual(['Sunday Service: once'])
    // One moved to another time: how often, without a time.
    const moved = { ...(weekly[1] as object), startTime: '6 PM' } as never
    expect(titled(onceEach([weekly[0], moved]))).toEqual(['Sunday Service: every Sunday'])
  })
})

describe('report times, for those on the event', () => {
  const day = '2026-10-11' // a Sunday
  const tmpl = [
    {
      id: 'out',
      title: 'Outreach Night',
      date: '2026-10-16',
      startTime: '7:00 PM',
      isPublic: true,
      users: ['me', 'sam', 'lee', 'kim'],
      teams: [
        { name: 'Worship', leaders: ['me'], members: ['sam'] },
        { name: 'Setup Team', leaders: [], members: ['me'] },
      ],
      reportTimes: [
        { group: 'Worship', time: '5:00 PM' },
        { group: 'Setup Team', time: '4:00 PM' },
        { group: '_remainder_', time: '6:00 PM' },
      ],
    },
    {
      id: 'sun',
      title: 'Sunday Service',
      isRec: true,
      recDay: 0,
      recur: 'weekly',
      startTime: '10:00 AM',
      isPublic: true,
      users: ['sam'],
      reportTimes: [{ group: '_remainder_', time: '8:30 AM' }],
    },
    { id: 'pic', title: 'Picnic', date: '2026-10-17', startTime: 'Noon', users: ['sam'] },
  ]
  const as = (uid: string, roles = ['regular']): QuickData => ({
    templates: tmpl as never,
    overrides: {},
    groups: [],
    viewer: { uid, roles },
    names: new Map(),
    today: day,
  })
  const ask = (text: string, uid: string, roles?: string[]) =>
    quickAnswer(text, as(uid, roles))?.text

  it('gives your team’s, or everyone else’s', () => {
    expect(ask('what time do I report for outreach night', 'sam')).toBe(
      'Report for Outreach Night on Friday, Oct 16 at 5:00 PM. It starts at 7:00 PM.'
    )
    expect(ask('when is call time for outreach night', 'lee')).toBe(
      'Report for Outreach Night on Friday, Oct 16 at 6:00 PM. It starts at 7:00 PM.'
    )
    expect(ask('when do I need to be there for sunday service', 'sam')).toBe(
      'Report for Sunday Service today at 8:30 AM. It starts at 10:00 AM.'
    )
  })

  it('names each of your teams’ when they differ', () => {
    expect(ask('report time for outreach night', 'me')).toBe(
      'Report times for Outreach Night on Friday, Oct 16: Worship: 5:00 PM; Setup Team: 4:00 PM. It starts at 7:00 PM.'
    )
  })

  it('gives an admin every one', () => {
    expect(ask('report time for outreach night', 'boss', ['admin'])).toBe(
      'Report times for Outreach Night on Friday, Oct 16: Worship: 5:00 PM; Setup Team: 4:00 PM; Everyone else: 6:00 PM. It starts at 7:00 PM.'
    )
  })

  it('tells someone not on it only when it starts', () => {
    expect(ask('what time do I report for sunday service', 'kim')).toBe(
      'Sunday Service is today at 10:00 AM.'
    )
    // A public follower: none of the team side.
    expect(ask('what time do I report for outreach night', 'pub', ['public'])).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where Outreach Night is.'
    )
  })

  it('says when there is none', () => {
    expect(ask('what time do we report for the picnic', 'sam')).toBe(
      'Picnic is on Saturday, Oct 17 at Noon. No report time is set.'
    )
  })
})
