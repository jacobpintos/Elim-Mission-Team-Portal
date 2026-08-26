import type { PublicProfile, UserProfile } from '@/types/user'

/**
 * Directory entries, with any full record overlaid on top.
 *
 * Two sources, because one collection cannot serve both readers. `users` holds
 * push tokens, emails, locations, block lists and report history, so its rules
 * admit only its owner and admins — and Firestore refuses a collection query
 * outright when it could return a document the caller may not read, rather
 * than filtering it down. So every non-admin's listener was denied, the array
 * stayed empty, and name lookups fell through to the raw uid.
 *
 * `publicProfiles` answers only "who is this uid?" and any signed-in user may
 * read it.
 *
 * A full record wins because it is the same person with more detail. A user
 * present only in `users` is kept too — mirrorPublicProfile runs on write, so
 * an account untouched since the mirror was introduced has no directory entry
 * until the backfill reaches it.
 *
 * Lives apart from the store so it can be tested without loading Firebase,
 * which reaches react-native and cannot be parsed under vitest.
 */
export function mergeUsers(directory: PublicProfile[], full: UserProfile[]): UserProfile[] {
  const byUid = new Map<string, UserProfile>()
  for (const p of directory) {
    // Identity only. The remaining UserProfile fields are absent rather than
    // guessed; nothing that renders a name reads them.
    byUid.set(String(p.uid), {
      uid: p.uid,
      displayName: p.displayName,
      photoURL: p.photoURL,
    } as UserProfile)
  }
  for (const u of full) byUid.set(String(u.uid), u)
  return [...byUid.values()]
}
