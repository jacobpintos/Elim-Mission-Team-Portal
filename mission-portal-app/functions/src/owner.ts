import { HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

/**
 * The one account that sits above admin.
 *
 * A uid rather than a role, because roles live in `users/{uid}.roles` and the
 * rules let any admin write that document — an `owner` role would be a lock
 * whose key is on the same ring. A literal uid cannot be granted, escalated
 * into, or edited from inside the app at all; changing who the owner is takes
 * a deploy, which for a single permanent owner is the point.
 *
 * Kept in three places, which must agree:
 *   - here, for the callables
 *   - `src/lib/owner.ts`, for hiding owner-only controls
 *   - `isOwnerUid()` in firestore.rules, for direct document access
 *
 * Empty would mean nobody is the owner, and the owner-only callables would
 * refuse everyone rather than fall back to admin.
 */
export const OWNER_UID = '0RUxDLC8QGQ6qBTLgBkoMSgYibJ2'

export function isOwner(uid: string | undefined): boolean {
  return !!OWNER_UID && !!uid && uid === OWNER_UID
}

/** True when this account is the one nobody else may act on. */
export function isOwnerTarget(uid: string | undefined): boolean {
  return isOwner(uid)
}

/** Caller must be the owner. Admins are not enough. */
export function requireOwner(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  if (!OWNER_UID) {
    throw new HttpsError(
      'failed-precondition',
      'No owner is configured. Set OWNER_UID in functions/src/owner.ts and deploy.'
    )
  }
  if (uid !== OWNER_UID) {
    throw new HttpsError('permission-denied', 'This is restricted to the account owner.')
  }
  return uid
}

/** Caller must be an admin. Returns their uid. */
export async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const snap = await admin.firestore().collection('users').doc(uid).get()
  const roles: string[] = snap.data()?.roles ?? []
  if (!roles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')
  return uid
}

/**
 * Refuse when an admin is acting on the owner's account.
 *
 * Without this the owner-only restrictions are decoration: an admin resets
 * the owner's password, signs in as them, and has everything.
 */
export function refuseIfOwnerTarget(targetUid: string | undefined, callerUid: string | undefined) {
  if (isOwnerTarget(targetUid) && targetUid !== callerUid) {
    throw new HttpsError('permission-denied', "The owner's account cannot be changed by anyone else.")
  }
}
