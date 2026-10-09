import { describe, expect, it } from 'vitest'
import {
  COMMANDS,
  commandsFor,
  draftFromInput,
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

const input = (over: Partial<EventFormInput>): Partial<EventFormInput> => ({
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
    const questions = ['find_events', 'get_event', 'event_availability', 'find_tasks', 'answer']
    expect(commandsFor(['admin'])).toEqual(['open_event_form', 'people_and_groups', ...questions])
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

  it('names roles for every command, and a strict schema', () => {
    for (const { roles, tool } of Object.values(COMMANDS)) {
      expect(roles.length).toBeGreaterThan(0)
      expect(tool.input_schema.additionalProperties).toBe(false)
      expect(new Set(tool.input_schema.required as string[])).toEqual(
        new Set(Object.keys(tool.input_schema.properties as object))
      )
    }
  })
})

describe('filling in the event form', () => {
  it('works out everyone in a group but one, as people', () => {
    const { draft, notes } = draftFromInput(
      input({ groups: ['gAll'], except_people: ['u1'] }),
      roster
    )
    expect(draft.users.sort()).toEqual(['u2', 'u3', 'u4'])
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
