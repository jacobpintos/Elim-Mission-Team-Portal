import { describe, expect, it } from 'vitest'
import {
  COMMANDS,
  commandsFor,
  draftFromInput,
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

  it('shows the button to exactly those who have a command', () => {
    for (const roles of [['admin'], ['regular'], ['worship'], ['guest'], ['public'], []]) {
      const profile = { roles } as unknown as UserProfile
      expect(canUseMiriam(profile)).toBe(commandsFor(roles).length > 0)
    }
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
