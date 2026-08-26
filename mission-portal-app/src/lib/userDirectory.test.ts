import { describe, it, expect } from 'vitest'
import { mergeUsers } from '@/lib/userDirectory'
import type { PublicProfile, UserProfile } from '@/types/user'

/**
 * Who the app thinks everyone is.
 *
 * The bug these exist for: every non-admin saw raw Firebase uids wherever a
 * name belonged. `users` is readable only by its owner and by admins, and
 * Firestore refuses a collection query outright when it could return a
 * document the caller may not read — so the listener was denied, the array
 * stayed empty, and every lookup fell through to String(uid).
 */

const profile = (uid: string, displayName: string, photoURL?: string): PublicProfile =>
  photoURL ? { uid, displayName, photoURL } : { uid, displayName }

const full = (uid: string, displayName: string, email: string): UserProfile =>
  ({ uid, displayName, email, roles: ['regular'] }) as UserProfile

describe('mergeUsers', () => {
  it('names everyone in the directory when no full records exist', () => {
    const merged = mergeUsers([profile('a1', 'Mitch Moylan'), profile('b2', 'Sunny Singh')], [])

    expect(merged).toHaveLength(2)
    expect(merged.find((u) => u.uid === 'a1')?.displayName).toBe('Mitch Moylan')
    expect(merged.find((u) => u.uid === 'b2')?.displayName).toBe('Sunny Singh')
  })

  it('carries photoURL through, and leaves it absent when there is none', () => {
    const merged = mergeUsers(
      [profile('a1', 'Mitch Moylan', 'https://x/p.jpg'), profile('b2', 'Sunny Singh')],
      []
    )

    expect(merged.find((u) => u.uid === 'a1')?.photoURL).toBe('https://x/p.jpg')
    expect(merged.find((u) => u.uid === 'b2')?.photoURL).toBeUndefined()
  })

  it('prefers the full record, so an admin keeps email and roles', () => {
    const merged = mergeUsers(
      [profile('a1', 'Mitch Moylan')],
      [full('a1', 'Mitch Moylan', 'mitchell.moylan@thewellia.com')]
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].email).toBe('mitchell.moylan@thewellia.com')
    expect(merged[0].roles).toEqual(['regular'])
  })

  it('keeps a user the mirror has not reached yet', () => {
    // mirrorPublicProfile runs on write, so an account untouched since it was
    // introduced has no directory entry until the backfill reaches it.
    const merged = mergeUsers([], [full('c3', 'Taylor', 'taylor155kts@gmail.com')])

    expect(merged.map((u) => u.uid)).toEqual(['c3'])
    expect(merged[0].displayName).toBe('Taylor')
  })

  it('lists nobody twice when a user is in both sources', () => {
    const merged = mergeUsers(
      [profile('a1', 'Mitch Moylan'), profile('b2', 'Sunny Singh')],
      [full('a1', 'Mitch Moylan', 'mitchell.moylan@thewellia.com')]
    )

    expect(merged).toHaveLength(2)
    expect(merged.filter((u) => u.uid === 'a1')).toHaveLength(1)
  })

  it('has nothing to say when both sources are empty', () => {
    // The state a signed-out app sits in. Callers fall back to String(uid),
    // which is the old broken behaviour — correct only when nothing is loaded.
    expect(mergeUsers([], [])).toEqual([])
  })
})
