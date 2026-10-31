import { describe, expect, it } from 'vitest'
import { coverFaces, directWith, dmId, otherMember, roomKind, roomTitle } from './rooms'

const people = [
  { uid: 'ann', displayName: 'Ann Lee', photoURL: 'https://x/ann.jpg' },
  { uid: 'bo', displayName: 'Bo Park' },
  { uid: 'cy', displayName: 'Cy Diaz', photoURL: 'https://x/cy.jpg' },
  { uid: 'di', displayName: 'Di Fox', photoURL: 'https://x/di.jpg' },
  { uid: 'ed', displayName: 'Ed Moe', photoURL: 'https://x/ed.jpg' },
]

describe('a conversation', () => {
  it('is a direct message between two, a group chat of more — as kept, or by its count', () => {
    expect(roomKind({ kind: 'group', members: ['ann', 'bo'] })).toBe('group')
    expect(roomKind({ members: ['ann', 'bo'] })).toBe('dm')
    expect(roomKind({ members: ['ann', 'bo', 'cy'] })).toBe('group')
  })

  it('has one direct message per pair, whoever starts it', () => {
    expect(dmId('bo', 'ann')).toBe('dm_ann_bo')
    expect(dmId('ann', 'bo')).toBe('dm_ann_bo')
    const rooms = [
      { id: 'g', kind: 'group' as const, members: ['ann', 'bo', 'cy'] },
      { id: 'old', members: ['bo', 'ann'] },
    ]
    expect(directWith(rooms, 'ann', 'bo')?.id).toBe('old')
    expect(directWith(rooms, 'ann', 'cy')).toBeUndefined()
    expect(otherMember({ members: ['ann', 'bo'] }, 'ann')).toBe('bo')
  })

  it('is called, as a direct message, by the other person — no name of its own', () => {
    const dm = { kind: 'dm' as const, name: 'Old room name', members: ['ann', 'bo'] }
    expect(roomTitle(dm, 'ann', people)).toBe('Bo Park')
    expect(roomTitle(dm, 'bo', people)).toBe('Ann Lee')
    // To an admin reading it, reported: both.
    expect(roomTitle(dm, 'boss', people)).toBe('Ann Lee & Bo Park')
    expect(
      roomTitle({ kind: 'group', name: 'Crew', members: ['ann', 'bo', 'cy'] }, 'ann', people)
    ).toBe('Crew')
  })

  it('shows, as a group chat without a cover, up to four of the others — photos first', () => {
    const room = { kind: 'group' as const, members: ['ann', 'bo', 'cy', 'di', 'ed'] }
    expect(coverFaces(room, 'ann', people).map((p) => p.uid)).toEqual(['cy', 'di', 'ed', 'bo'])
    expect(coverFaces(room, 'cy', people, 3).map((p) => p.uid)).toEqual(['ann', 'di', 'ed'])
  })
})
