import { describe, expect, it } from 'vitest'
import {
  canKeepDateNotes,
  daySaid,
  isDay,
  noteAsked,
  noteAddedSaid,
  notesBetween,
  notesMeant,
  notesOn,
  notesReadSaid,
  type DateNote,
} from './dateNotes'
import type { UserProfile } from '@/types/user'

const TODAY = '2026-10-14' // a Wednesday

describe('a note asked for', () => {
  it.each([
    ['add a note to Friday: bring the projector', '2026-10-16', 'Bring the projector'],
    ['make a note on October 20th to call the venue', '2026-10-20', 'Call the venue'],
    ['note for tomorrow: pick up donuts', '2026-10-15', 'Pick up donuts'],
    ['add a note for the 20th that the gym is closed', '2026-10-20', 'The gym is closed'],
    ['add a note to call Sam on Friday', '2026-10-16', 'Call Sam'],
    [
      'can you make a note for Saturday saying set up chairs at 8',
      '2026-10-17',
      'Set up chairs at 8',
    ],
    ['put the dentist on my calendar Friday', '2026-10-16', 'The dentist'],
    ['jot down a note for next Tuesday: order shirts', '2026-10-20', 'Order shirts'],
    ['put a note on Friday to bring cords', '2026-10-16', 'Bring cords'],
    [
      "add a note for Friday: Sam's birthday is tomorrow",
      '2026-10-16',
      "Sam's birthday is tomorrow",
    ],
    ['add to my notes for 10/31: costume', '2026-10-31', 'Costume'],
  ])('%s', (said, date, text) => {
    expect(noteAsked(said, TODAY)).toEqual({ kind: 'add', date, text })
  })

  it('without a day, or words, says so: to be asked', () => {
    expect(noteAsked('add a note: bring the projector', TODAY)).toEqual({
      kind: 'add',
      date: null,
      text: 'Bring the projector',
    })
    expect(noteAsked('add a note to Friday', TODAY)).toEqual({
      kind: 'add',
      date: '2026-10-16',
      text: '',
    })
  })

  it('is not a message, a reminder, a song’s notes, or an event', () => {
    for (const said of [
      'write a note to Sam saying thanks',
      'leave a note for Jacob',
      'remind me to take notes at the meeting',
      'what are my notes on Above All',
      'add an event to my calendar for Friday',
      'note that I can’t make it Friday',
      'what time is youth night',
    ]) {
      expect(noteAsked(said, TODAY), said).toBeNull()
    }
  })

  it('read: for a span said, else what is coming up', () => {
    expect(noteAsked('what are my notes for Friday', TODAY)).toEqual({
      kind: 'read',
      from: '2026-10-16',
      to: '2026-10-16',
      span: 'on Friday',
    })
    expect(noteAsked('do I have any notes this week?', TODAY)).toMatchObject({
      kind: 'read',
      from: TODAY,
      to: '2026-10-17',
      span: 'this week',
    })
    expect(noteAsked('read me my notes', TODAY)).toEqual({
      kind: 'read',
      from: TODAY,
      to: '2026-12-13',
      span: '',
    })
  })

  it('taken away: by its day, or its words', () => {
    expect(noteAsked('delete my note for Friday', TODAY)).toEqual({
      kind: 'remove',
      date: '2026-10-16',
      words: '',
    })
    expect(noteAsked('remove the projector note', TODAY)).toEqual({
      kind: 'remove',
      date: null,
      words: 'projector',
    })
    expect(noteAsked('clear all my notes for tomorrow', TODAY)).toMatchObject({
      kind: 'remove',
      date: '2026-10-15',
    })
  })
})

const n = (id: string, date: string, text: string, at = 1): DateNote => ({ id, date, text, at })
const NOTES = [
  n('a', '2026-10-16', 'Bring the projector', 2),
  n('b', '2026-10-16', 'Call Sam', 1),
  n('c', '2026-10-17', 'Set up chairs'),
  n('d', '2026-11-03', 'Vote'),
]

describe('notes kept', () => {
  it('by day, as written', () => {
    expect(notesOn(NOTES, '2026-10-16').map((x) => x.id)).toEqual(['b', 'a'])
    expect(notesBetween(NOTES, '2026-10-16', '2026-10-17').map((x) => x.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('said as she says them', () => {
    expect(daySaid('2026-10-14', TODAY)).toBe('today')
    expect(daySaid('2026-10-15', TODAY)).toBe('tomorrow')
    expect(daySaid('2026-10-16', TODAY)).toBe('Friday')
    expect(daySaid('2026-11-03', TODAY)).toBe('Tuesday, Nov 3')
    expect(noteAddedSaid('2026-10-16', 'Bring the projector.', TODAY)).toBe(
      'Okay — I added a note on Friday: Bring the projector.'
    )
    expect(notesReadSaid(notesBetween(NOTES, TODAY, '2026-10-17'), 'this week', TODAY)).toBe(
      'This week you have 3 notes: Friday — Call Sam; Bring the projector. Saturday — Set up chairs.'
    )
    expect(notesReadSaid(notesOn(NOTES, '2026-10-17'), 'on Saturday', TODAY)).toBe(
      'On Saturday you have a note: Set up chairs.'
    )
    expect(notesReadSaid([], 'tomorrow', TODAY)).toBe('You don’t have any notes tomorrow.')
  })

  it('the ones a "delete" means', () => {
    expect(notesMeant(NOTES, { date: '2026-10-16', words: '' }, TODAY).map((x) => x.id)).toEqual([
      'b',
      'a',
    ])
    expect(notesMeant(NOTES, { date: null, words: 'projector' }, TODAY).map((x) => x.id)).toEqual([
      'a',
    ])
    expect(notesMeant(NOTES, { date: null, words: '' }, TODAY)).toEqual([])
  })

  it('kept by anyone but a public account', () => {
    const as = (roles: string[]) => ({ roles }) as unknown as UserProfile
    expect(canKeepDateNotes(as(['regular']))).toBe(true)
    expect(canKeepDateNotes(as(['guest']))).toBe(true)
    expect(canKeepDateNotes(as(['public']))).toBe(false)
    expect(canKeepDateNotes(as(['unverified']))).toBe(false)
    expect(canKeepDateNotes(null)).toBe(false)
  })

  it('on real days only', () => {
    expect(isDay('2026-10-16')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('Friday')).toBe(false)
  })
})
