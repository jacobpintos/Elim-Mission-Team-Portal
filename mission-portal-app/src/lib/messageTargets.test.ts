import { describe, expect, it } from 'vitest'
import type { Room } from '@/types/events'
import { messageTargets } from './miriamAppData'

const room = (id: string, members: string[], extra: Partial<Room> = {}) =>
  ({ id, members, ...extra }) as unknown as Room
const people = [
  { uid: 'me', name: 'Jacob Pintos' },
  { uid: 'kolton', name: 'Kolton Reyes' },
  { uid: 'sam', name: 'Sam Hart' },
  { uid: 'samuel', name: 'Samuel Lee' },
  { uid: 'beth', name: 'Beth Ortiz' },
]
const allChat = room('all', ['me', 'kolton', 'sam', 'beth'], { kind: 'group', name: 'All Chat' })

describe('who a message is for', () => {
  it('is the person, never a group chat they are in — a new conversation if there isn’t one', () => {
    expect(messageTargets([allChat], people, 'me', 'Kolton')).toEqual([
      { kind: 'person', uid: 'kolton', name: 'Kolton Reyes', room: null },
    ])
    const dm = room('dm_kolton_me', ['me', 'kolton'], { kind: 'dm' })
    expect(messageTargets([allChat, dm], people, 'me', 'kolton')).toEqual([
      { kind: 'person', uid: 'kolton', name: 'Kolton Reyes', room: dm },
    ])
  })

  it('is a group chat by its own name', () => {
    expect(messageTargets([allChat], people, 'me', 'all chat')).toEqual([
      { kind: 'group', room: allChat, name: 'All Chat' },
    ])
  })

  it('takes the whole name over a word begun, and offers each when more than one fit as well', () => {
    // "Sam" is Sam Hart, not Samuel.
    expect(messageTargets([], people, 'me', 'Sam').map((t) => t.name)).toEqual(['Sam Hart'])
    expect(messageTargets([], people, 'me', 'Sa').map((t) => t.name)).toEqual([
      'Sam Hart',
      'Samuel Lee',
    ])
  })

  it('never offers yourself, and says nothing for a name that fits no one', () => {
    expect(messageTargets([], people, 'me', 'Jacob')).toEqual([])
    expect(messageTargets([allChat], people, 'me', 'Zed')).toEqual([])
  })

  it('finds a group chat with no name by the people in it', () => {
    const trio = room('g1', ['me', 'sam', 'beth'], { kind: 'group' })
    expect(messageTargets([trio], [], 'me', 'Sam and Beth')).toEqual([])
    const found = messageTargets([trio], people, 'me', 'Sam and Beth')
    expect(found).toEqual([{ kind: 'group', room: trio, name: 'your group with Sam, Beth' }])
  })
})
