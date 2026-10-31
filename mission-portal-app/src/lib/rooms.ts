/**
 * Conversations (Messages): a direct message between two people, or a group
 * chat of more than two. A direct message has no name — it is the other
 * person, by their name and photo; a group chat has a name, and a cover
 * photo if one was added, or else some of its people's photos.
 */
import type { Room } from '@/types/events'

export type RoomKind = 'dm' | 'group'

type Members = Pick<Room, 'members'> & { kind?: RoomKind }

/** What a room is: as kept, or — one from before rooms said — by how many are in it. */
export const roomKind = (room: Members): RoomKind =>
  room.kind ?? (room.members.length === 2 ? 'dm' : 'group')

/** A direct message's id: the same for the two of them, whoever starts it. */
export const dmId = (a: string, b: string) => `dm_${[String(a), String(b)].sort().join('_')}`

/** The other person in a direct message. */
export const otherMember = (room: Members, uid: string): string | null =>
  room.members.map(String).find((m) => m !== String(uid)) ?? null

/** The direct message these two already have, if any. */
export function directWith<T extends Members>(
  rooms: T[],
  uid: string,
  other: string
): T | undefined {
  const pair = [String(uid), String(other)].sort().join('|')
  return rooms.find(
    (r) =>
      roomKind(r) === 'dm' &&
      r.members.length === 2 &&
      r.members.map(String).sort().join('|') === pair
  )
}

interface Person {
  uid: string | number
  displayName?: string
  photoURL?: string
}

/**
 * What a conversation is called, to this person: the other person, for a
 * direct message — or, to an admin reading one reported to them, both.
 */
export function roomTitle(
  room: Members & { name?: string },
  uid: string,
  people: Person[]
): string {
  if (roomKind(room) === 'dm') {
    const nameOf = (m: string | null) =>
      people.find((p) => String(p.uid) === m)?.displayName ?? 'Someone'
    if (!room.members.map(String).includes(String(uid))) {
      return room.members.map((m) => nameOf(String(m))).join(' & ')
    }
    const other = otherMember(room, uid)
    return other ? nameOf(other) : 'Direct message'
  }
  return room.name?.trim() || 'Group chat'
}

/**
 * Whose photos stand in for a group chat with no cover: up to four of the
 * others in it, those with a photo first, in the order they were added.
 */
export function coverFaces(room: Members, uid: string, people: Person[], most = 4): Person[] {
  const others = room.members
    .map(String)
    .filter((m) => m !== String(uid))
    .map((m) => people.find((p) => String(p.uid) === m) ?? { uid: m })
  const withPhoto = others.filter((p) => !!p.photoURL)
  const without = others.filter((p) => !p.photoURL)
  return [...withPhoto, ...without].slice(0, most)
}
