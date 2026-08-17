import type { UserProfile } from '@/types/user'

/**
 * The one account that sits above admin.
 *
 * This copy exists only to hide controls the owner alone can use — it is not
 * a security boundary. The callables and the rules enforce it; a client that
 * lied about this would still be refused by both.
 *
 * Must match OWNER_UID in `functions/src/owner.ts` and `ownerUid()` in
 * firestore.rules.
 */
export const OWNER_UID = '0RUxDLC8QGQ6qBTLgBkoMSgYibJ2'

export function isOwnerUid(uid: string | undefined): boolean {
  return !!OWNER_UID && !!uid && uid === OWNER_UID
}

export function isOwner(u: UserProfile | null | undefined): boolean {
  return isOwnerUid(u?.uid)
}
