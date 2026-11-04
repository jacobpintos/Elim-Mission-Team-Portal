import { describe, expect, it } from 'vitest'
import {
  APP_TOOLS,
  COMMANDS,
  commandsFor,
  draftFromInput,
  formOnScreenFrom,
  formOnScreenSaid,
  isPublicFollower,
  PUBLIC_APP_TOOLS,
  publicReply,
  taskDraftFromInput,
  validDate,
  validTime,
  type EventFormInput,
  type Roster,
} from '../../functions/src/miriam/plan'
import { canUseMiriam, miriamHref } from './miriam'
import type { UserProfile } from '@/types/user'

const roster: Roster = {
  people: [
    { id: 'u1', name: 'Jacob Pintos' },
    { id: 'u2', name: 'Sarah Lee' },
    { id: 'u3', name: 'Tom Hart' },
    { id: 'u4', name: 'Ana Ruiz' },
  ],
  groups: [
    { id: 'gAll', name: 'All', members: ['u1', 'u2', 'u3', 'u4'] },
    { id: 'gWorship', name: 'Worship', members: ['u2', 'u3'] },
  ],
}

const input = (over: EventFormInput): EventFormInput => ({
  title: 'Revival In The Heartland',
  date: '2027-09-25',
  start_time: '9:00 PM',
  venue: '',
  address: '',
  city: 'Coralville',
  state: 'IA',
  groups: [],
  people: [],
  except_people: [],
  unmatched_names: [],
  ...over,
})

describe('who may use what', () => {
  it('gives event creation to admins only, and questions to every member and guest', () => {
    const questions = [
      'find_events',
      'get_event',
      'event_availability',
      'event_weather',
      'find_tasks',
      'answer',
    ]
    expect(commandsFor(['admin'])).toEqual([
      'open_event_form',
      'edit_event',
      'open_task_form',
      'people_and_groups',
      ...questions,
    ])
    expect(commandsFor(['regular', 'worship', 'security'])).toEqual(questions)
    expect(commandsFor(['guest'])).toEqual(questions)
    expect(commandsFor(['public'])).toEqual([])
    expect(commandsFor(undefined)).toEqual([])
  })

  it('shows the button to exactly those who have a command — and public followers, answered by her alone', () => {
    for (const roles of [
      ['admin'],
      ['regular'],
      ['worship'],
      ['guest'],
      ['public'],
      ['unverified'],
      [],
    ]) {
      const profile = { roles } as unknown as UserProfile
      expect(canUseMiriam(profile), roles.join()).toBe(
        commandsFor(roles).length > 0 || isPublicFollower(roles)
      )
    }
    expect(isPublicFollower(['public'])).toBe(true)
    expect(isPublicFollower(['public', 'regular'])).toBe(false)
    expect(isPublicFollower(['guest'])).toBe(false)
    expect(isPublicFollower(['unverified'])).toBe(false)
  })

  it('a public follower: her own answers only — looking things up, changing nothing', () => {
    expect([...PUBLIC_APP_TOOLS].sort()).toEqual([
      'app_guide',
      'find_content',
      'read_announcements',
      'read_settings',
      'read_store',
    ])
    expect(publicReply('thanks so much')).toBe('You’re welcome!')
    expect(publicReply('hi there')).toMatch(/^Hi!/)
    expect(publicReply('can you write me a poem')).toMatch(/^Sorry, I can’t help with that one yet/)
  })

  it('names roles for every command, and a closed schema — strict ones with every field required', () => {
    for (const { roles, tool } of Object.values(COMMANDS)) {
      expect(roles.length).toBeGreaterThan(0)
      expect(tool.input_schema.additionalProperties).toBe(false)
      if (!tool.strict) continue
      expect(new Set(tool.input_schema.required as string[])).toEqual(
        new Set(Object.keys(tool.input_schema.properties as object))
      )
    }
    // The event forms are checked here instead (draftFromInput): too large to be strict.
    expect(COMMANDS.open_event_form.tool.strict).toBe(false)
    expect(COMMANDS.edit_event.tool.strict).toBe(false)
  })
})

describe('filling in the event form', () => {
  it('works out everyone in a group but one, as people', () => {
    const { draft, notes } = draftFromInput(
      input({ groups: ['gAll'], except_people: ['u1'] }),
      roster
    )
    expect(draft.users?.sort()).toEqual(['u2', 'u3', 'u4'])
    expect(draft.groups).toEqual([])
    expect(draft).toMatchObject({
      title: 'Revival In The Heartland',
      date: '2027-09-25',
      startTime: '9:00 PM',
      city: 'Coralville',
      state: 'IA',
    })
    expect(notes).toEqual([])
  })

  it('assigns a whole group as the group', () => {
    const { draft } = draftFromInput(input({ groups: ['gWorship'], people: ['u1'] }), roster)
    expect(draft.groups).toEqual(['gWorship'])
    expect(draft.users).toEqual(['u1'])
  })

  it('keeps only ids on the roster', () => {
    const { draft } = draftFromInput(
      input({ groups: ['gAll', 'gNope'], people: ['u2', 'intruder'], except_people: ['ghost'] }),
      roster
    )
    expect(draft.groups).toEqual(['gAll'])
    expect(draft.users).toEqual(['u2'])
  })

  it('says which names matched nobody', () => {
    const { notes } = draftFromInput(input({ unmatched_names: ['Jake S.'] }), roster)
    expect(notes).toEqual(['Couldn’t find “Jake S.” — add them by hand.'])
  })

  it('drops a date or time that is not one', () => {
    const { draft } = draftFromInput(input({ date: '2027-02-30', start_time: 'evening' }), roster)
    expect(draft.date).toBe('')
    expect(draft.startTime).toBe('')
  })
})

describe('dates and times', () => {
  it('accepts real dates only', () => {
    expect(validDate('2027-09-25')).toBe('2027-09-25')
    expect(validDate('2028-02-29')).toBe('2028-02-29')
    expect(validDate('2027-02-29')).toBe('')
    expect(validDate('9/25/27')).toBe('')
  })

  it('writes times the way the form does', () => {
    expect(validTime('9:00 PM')).toBe('9:00 PM')
    expect(validTime('9 pm')).toBe('9:00 PM')
    expect(validTime('10:30am')).toBe('10:30 AM')
    expect(validTime('21:00')).toBe('9:00 PM')
    expect(validTime('0:15')).toBe('12:15 AM')
    expect(validTime('13:00 PM')).toBe('')
    expect(validTime('soon')).toBe('')
  })
})

describe('where an answer is shown', () => {
  it('is the event at the part asked about, the task, or the availability page', () => {
    expect(miriamHref({ kind: 'event', key: 'ev1_2026-10-25', section: 'dress_code' })).toBe(
      '/events/ev1_2026-10-25?focus=dress_code'
    )
    expect(miriamHref({ kind: 'event', key: 'ev1_2026-10-25', section: null })).toBe(
      '/events/ev1_2026-10-25'
    )
    expect(miriamHref({ kind: 'task', id: 't 1' })).toBe('/assignments?taskId=t%201')
    expect(miriamHref({ kind: 'availability' })).toBe('/admin/avail')
  })
})

describe('filling in every part of the event form', () => {
  const full: Roster = {
    ...roster,
    commonTeams: [{ name: 'Production', members: ['u3', 'u4', 'ghost'] }],
    taskTemplates: [{ id: 't1', name: 'Conference setup' }],
  }

  it('fills in repeating, links, food, cars, lodging, flights, teams, dress code and extra days', () => {
    const { draft, notes } = draftFromInput(
      input({
        date: '2027-09-26',
        repeat: 'weekly',
        public: true,
        virtual_link: 'https://zoom.us/j/123',
        food_items: ['Chips', ' ', 'Paper plates'],
        cars: [{ label: 'Van', seats: 7, driver_id: 'u1', rider_ids: ['u2', 'intruder'] }],
        lodging: [{ name: 'Hilton', room: '204', people_ids: ['u2', 'u3'] }],
        flights: [
          { person_id: 'u1', outbound: { date: '2027-09-25', time: '7 am', airline: 'Delta' } },
          { person_id: 'ghost', outbound: { date: '2027-09-25' } },
        ],
        teams: [{ name: 'Hospitality', leader_ids: ['u2'], member_ids: ['u4'] }],
        common_teams: ['production', 'Sound'],
        dress_code: [
          { for: 'Production', text: 'All black' },
          { for: 'everyone', text: 'Business casual' },
        ],
        extra_days: [
          { date: '2027-09-27', start_time: '10 am', venue: 'Hall B' },
          { date: 'soon' },
        ],
        task_template_id: 't1',
      }),
      full
    )
    // "every Sunday" from the date when no weekday is said: 2027-09-26 is a Sunday.
    expect(draft.repeat).toEqual({ recur: 'weekly', recDay: 0 })
    expect(draft).toMatchObject({
      isPublic: true,
      isVirtual: true,
      virtualLink: 'https://zoom.us/j/123',
    })
    expect(draft.foodItems).toEqual(['Chips', 'Paper plates'])
    expect(draft.cars).toEqual([{ label: 'Van', seats: 7, driver: 'u1', riders: ['u2'] }])
    expect(draft.lodging?.[0]).toMatchObject({
      name: 'Hilton',
      room: '204',
      assignees: ['u2', 'u3'],
    })
    expect(draft.flights).toEqual([
      {
        uid: 'u1',
        out: expect.objectContaining({ date: '2027-09-25', time: '7:00 AM', airline: 'Delta' }),
        ret: expect.objectContaining({ date: '' }),
      },
    ])
    expect(draft.teams).toEqual([
      { name: 'Hospitality', leaders: ['u2'], members: ['u4'] },
      { name: 'Production', leaders: [], members: ['u3', 'u4'] },
    ])
    expect(draft.dressCode).toEqual([
      { group: 'Production', text: 'All black' },
      { group: '_remainder_', text: 'Business casual' },
    ])
    expect(draft.extraDays).toEqual([
      { date: '2027-09-27', startTime: '10:00 AM', location: 'Hall B' },
    ])
    expect(draft.taskTemplateId).toBe('t1')
    expect(notes).toEqual([
      'A flight was for someone I couldn’t find — add it by hand.',
      'There’s no common team called “Sound”.',
    ])
  })

  it('leaves out what was not said, and refuses a link that is not one', () => {
    const { draft, notes } = draftFromInput(input({ virtual_link: 'zoom' }), full)
    expect(draft).not.toHaveProperty('repeat')
    expect(draft).not.toHaveProperty('cars')
    expect(draft).not.toHaveProperty('virtualLink')
    expect(notes).toEqual(['“zoom” isn’t a web link — add the meeting link by hand.'])
  })

  it('changes an existing event: only what was said, people added and taken off', () => {
    const base = { users: ['u1'], groups: ['gWorship'] }
    const { draft } = draftFromInput(
      { event_key: 'e1_2027-09-25', start_time: '7 pm', add_people: ['u4'], remove_people: ['u3'] },
      full,
      base
    )
    expect(draft.startTime).toBe('7:00 PM')
    expect(draft.title).toBe('')
    // Tom was in Worship, assigned as a group: Worship's others, one by one, without him.
    expect(draft.groups).toEqual([])
    expect(draft.users?.sort()).toEqual(['u1', 'u2', 'u4'])
    // Nothing said about people: they stay as they are.
    expect(draftFromInput({ event_key: 'x', city: 'Ames' }, full, base).draft).not.toHaveProperty(
      'users'
    )
  })
})

describe('an event described out loud, as it comes', () => {
  // "The event is called Revive Me. It starts at 4 PM. Actually, it starts at
  // 5. I'm still trying to figure out if Andy is going. The guys are going
  // though. You can add Emily too. I'll have to check if the flagging team is
  // needed. We'll have report time at 3 for setup and rehearsal at 4."
  const church: Roster = {
    people: [
      { id: 'andy', name: 'Andy Cole' },
      { id: 'ben', name: 'Ben Ortiz' },
      { id: 'carl', name: 'Carl Diaz' },
      { id: 'dan', name: 'Dan Moss' },
      { id: 'emily', name: 'Emily Ruiz' },
      { id: 'fay', name: 'Fay Lin' },
      { id: 'gus', name: 'Gus Hart' },
    ],
    groups: [
      { id: 'gMen', name: 'Men', members: ['andy', 'ben', 'carl', 'dan'] },
      { id: 'gFlag', name: 'Flagging', members: ['fay', 'gus'] },
    ],
    commonTeams: [
      // Worship has Fay too, and Setup has Gus: neither is on the event.
      { name: 'Worship', members: ['ben', 'emily', 'fay'] },
      { name: 'Setup', members: ['carl', 'dan', 'gus'] },
    ],
  }
  const asReadByClaude: EventFormInput = {
    title: 'Revive Me',
    start_time: '5 pm',
    groups: ['gMen'],
    people: ['emily'],
    common_teams: ['Setup', 'Worship'],
    report_times: [
      { for: 'setup', time: '3 pm' },
      { for: 'Worship', time: '4:00 PM' },
    ],
    schedule: [
      { time: '3 pm', title: 'Setup' },
      { time: '4 pm', title: 'Rehearsal', notes: '' },
    ],
    left_out: ['Andy — not sure he’s going', 'The flagging team — to check'],
  }

  it('makes the teams of only those on the event, with their report times and the schedule', () => {
    const { draft, notes } = draftFromInput(asReadByClaude, church)
    expect(draft.title).toBe('Revive Me')
    expect(draft.startTime).toBe('5:00 PM')
    // The guys as their group, and Emily by name — no date said, and none guessed.
    expect(draft.groups).toEqual(['gMen'])
    expect(draft.users).toEqual(['emily'])
    expect(draft.date).toBe('')
    // Only those on the event: not Fay on Worship, nor Gus on Setup.
    expect(draft.teams).toEqual([
      { name: 'Setup', leaders: [], members: ['carl', 'dan'] },
      { name: 'Worship', leaders: [], members: ['ben', 'emily'] },
    ])
    expect(draft.reportTimes).toEqual([
      { group: 'Setup', time: '3:00 PM' },
      { group: 'Worship', time: '4:00 PM' },
    ])
    expect(draft.schedule).toEqual([
      { time: '3:00 PM', title: 'Setup' },
      { time: '4:00 PM', title: 'Rehearsal' },
    ])
    expect(notes).toEqual([
      'Left out for now, as you weren’t sure: Andy — not sure he’s going; The flagging team — to check.',
    ])
  })

  it('takes a group for a team where there is no common team of its name', () => {
    const { draft } = draftFromInput({ people: ['fay', 'ben'], common_teams: ['Flagging'] }, church)
    expect(draft.teams).toEqual([{ name: 'Flagging', leaders: [], members: ['fay'] }])
  })

  it('says so when no one on a team is on the event, and keeps the team for its time', () => {
    const { draft, notes } = draftFromInput(
      {
        people: ['andy'],
        common_teams: ['Worship'],
        report_times: [{ for: 'worship', time: '4pm' }],
      },
      church
    )
    expect(draft.teams).toEqual([{ name: 'Worship', leaders: [], members: [] }])
    expect(draft.reportTimes).toEqual([{ group: 'Worship', time: '4:00 PM' }])
    expect(notes).toEqual([
      'No one on Worship is on this event yet — add them to its team by hand.',
    ])
  })

  it('a time for everyone else is the form’s remainder', () => {
    const { draft } = draftFromInput({ report_times: [{ for: 'everyone', time: '6 pm' }] }, church)
    expect(draft.reportTimes).toEqual([{ group: '_remainder_', time: '6:00 PM' }])
  })
})

describe('carpools told by the cars that are going', () => {
  it('leaves who rides where to the app: the cars as said, and nobody in them yet', () => {
    const { draft } = draftFromInput(
      {
        cars: [
          { label: 'Andy’s van', seats: 7, driver_id: 'u1', rider_ids: ['u2'] },
          { label: 'Truck', driver_id: 'u3', child_names: ['Joey'] },
        ],
        cars_auto_assign: true,
        not_riding: ['u4', 'nobody'],
      },
      roster
    )
    expect(draft.carsAuto).toBe(true)
    expect(draft.notRiding).toEqual(['u4'])
    expect(draft.cars).toEqual([
      { label: 'Andy’s van', seats: 7, driver: 'u1', riders: [] },
      { label: 'Truck', driver: 'u3', riders: [], children: ['Joey'] },
    ])
  })

  it('keeps riders said, when it is not left to the app', () => {
    const { draft } = draftFromInput(
      { cars: [{ label: 'Van', driver_id: 'u1', rider_ids: ['u2'] }] },
      roster
    )
    expect(draft).not.toHaveProperty('carsAuto')
    expect(draft.cars?.[0].riders).toEqual(['u2'])
  })

  it('asks set_carpool for each car’s size and whether to fill them, strictly', () => {
    const tool = APP_TOOLS.set_carpool
    const props = tool.input_schema.properties as Record<
      string,
      { items?: { required?: string[] } }
    >
    expect(Object.keys(props).sort()).toEqual(['auto_assign', 'cars', 'event_key', 'not_riding'])
    expect(props.cars.items?.required).toContain('seats')
  })
})

describe('the event form open on their screen', () => {
  it('is read from what the app sends, and nothing else', () => {
    expect(formOnScreenFrom(null)).toBeNull()
    expect(formOnScreenFrom({ kind: 'task' })).toBeNull()
    const form = formOnScreenFrom({
      kind: 'event',
      of: 'a new event',
      lines: ['Title: Revive Me', '', 42],
      users: ['emily', 'emily', 7],
      groups: ['gMen'],
    })
    expect(form).toEqual({
      of: 'a new event',
      templateId: '',
      // Only lines of text: anything else sent is left out.
      lines: ['Title: Revive Me'],
      users: ['emily', '7'],
      groups: ['gMen'],
    })
    expect(formOnScreenSaid(form!)).toContain('- Title: Revive Me')
  })

  it('takes what is said now as changes to it: people added and taken off, the rest kept', () => {
    const onScreen = { users: ['u4', 'nameless'], groups: ['gWorship'] }
    const { draft } = draftFromInput(
      { start_time: '6 pm', add_people: ['u1'], remove_people: ['u4'] },
      roster,
      onScreen
    )
    expect(draft.startTime).toBe('6:00 PM')
    // Someone on the form with no name yet, on no roster, stays on it.
    expect(draft.users?.sort()).toEqual(['nameless', 'u1'])
    expect(draft.groups).toEqual(['gWorship'])
    // "The guys are going too", given as groups rather than add_groups: added, not in place.
    const more = draftFromInput({ groups: ['gAll'] }, roster, onScreen).draft
    expect(more.groups).toEqual(['gWorship', 'gAll'])
    expect(more.users).toEqual(['u4', 'nameless'])
  })

  it('puts a team made from a common team as the form has its people', () => {
    const teams: Roster = { ...roster, commonTeams: [{ name: 'Setup', members: ['u2', 'u4'] }] }
    const { draft } = draftFromInput({ common_teams: ['setup'] }, teams, {
      users: ['u4'],
      groups: [],
    })
    expect(draft.teams).toEqual([{ name: 'Setup', leaders: [], members: ['u4'] }])
  })
})

describe('filling in the task form', () => {
  it('assigns people, or a whole group, with a lead among them', () => {
    const one = taskDraftFromInput(
      {
        title: 'Book the hotel',
        due_date: '2027-09-01',
        people: ['u1', 'intruder'],
        group: '',
        lead: 'u1',
        unmatched_names: [],
      },
      roster
    )
    expect(one).toEqual({
      draft: {
        title: 'Book the hotel',
        dueDate: '2027-09-01',
        users: ['u1'],
        group: '',
        lead: 'u1',
      },
      notes: [],
    })
    const group = taskDraftFromInput(
      {
        title: 'Rehearse',
        due_date: 'friday',
        people: [],
        group: 'gWorship',
        lead: 'u1',
        unmatched_names: ['Kim'],
      },
      roster
    ).draft
    // Not a date; and Jacob isn't in Worship, so he can't lead it.
    expect(group).toEqual({
      title: 'Rehearse',
      dueDate: '',
      users: [],
      group: 'gWorship',
      lead: '',
    })
  })
})
