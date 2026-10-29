import { isAdmin } from '@/lib/roles'
import type { UserProfile } from '@/types/user'
import { ADMINS, EVERYONE } from '../../functions/src/eventPrivate'

/**
 * Who this person counts as to a record's `seenBy` (firestore.rules seers):
 * themselves, anyone (EVERYONE), and — an admin — every admin (ADMINS).
 * A query of what they may see asks for these, as the rules do.
 */
export function seers(profile: UserProfile): string[] {
  const uid = String(profile.uid)
  return isAdmin(profile) ? [uid, EVERYONE, ADMINS] : [uid, EVERYONE]
}

/**
 * The same for what is never everyone's — a private record's `access`, a
 * task's `seenBy` (firestore.rules readers): themselves and, an admin,
 * every admin.
 */
export function readers(profile: UserProfile): string[] {
  const uid = String(profile.uid)
  return isAdmin(profile) ? [uid, ADMINS] : [uid]
}
