import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

export const PUBLIC_PROFILES = 'publicProfiles'

/**
 * The directory entry for a user document.
 *
 * Only the two fields that answer "who is this uid?". Everything else on a
 * user — push tokens, email, location, block list, report history — is why
 * `users` stays readable by its owner and admins only.
 */
export interface PublicProfile {
  uid: string
  displayName: string
  photoURL?: string
}

/**
 * What the directory should say about a user, or null if it should say nothing.
 *
 * A user with no display name is skipped rather than written blank: the app
 * falls back to the uid either way, and an empty entry would claim the name is
 * known to be nothing.
 */
export function profileFrom(uid: string, data: FirebaseFirestore.DocumentData): PublicProfile | null {
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
  if (!displayName) return null
  const photoURL = typeof data.photoURL === 'string' ? data.photoURL : undefined
  return photoURL ? { uid, displayName, photoURL } : { uid, displayName }
}

/** Do two directory entries say the same thing? */
export function sameProfile(a: PublicProfile | null, b: PublicProfile | null): boolean {
  if (a === null || b === null) return a === b
  return a.uid === b.uid && a.displayName === b.displayName && a.photoURL === b.photoURL
}

/**
 * Keep publicProfiles/{uid} in step with users/{uid}.
 *
 * Runs on every write to a user document, which includes writes that touch
 * none of the mirrored fields — a push token refresh, a notification
 * preference, a lastLoginAt stamp. Those are the overwhelming majority, so the
 * previous entry is compared first and an unchanged mirror costs one read and
 * no write.
 */
export const mirrorPublicProfile = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid
  const db = admin.firestore()
  const ref = db.collection(PUBLIC_PROFILES).doc(uid)

  const after = event.data?.after
  const next = after?.exists ? profileFrom(uid, after.data() ?? {}) : null

  const current = await ref.get()
  const prev = current.exists ? (current.data() as PublicProfile) : null

  if (sameProfile(prev, next)) return

  if (next === null) {
    await ref.delete()
    logger.info('[publicProfiles] removed', { uid })
    return
  }

  await ref.set(next)
  logger.info('[publicProfiles] updated', { uid, displayName: next.displayName })
})

/**
 * Write a directory entry for every existing user.
 *
 * mirrorPublicProfile only fires on writes from here on, so accounts that are
 * not edited again would never appear. Admin-only, and safe to run repeatedly —
 * it writes the same entries a second time.
 */
export const backfillPublicProfiles = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.')

  const db = admin.firestore()
  const caller = await db.collection('users').doc(callerUid).get()
  const roles = (caller.data()?.roles ?? []) as string[]
  if (!roles.includes('admin')) {
    throw new HttpsError('permission-denied', 'Admins only.')
  }

  const snap = await db.collection('users').get()
  let written = 0
  let skipped = 0
  let batch = db.batch()
  let pending = 0

  for (const doc of snap.docs) {
    const profile = profileFrom(doc.id, doc.data())
    if (!profile) {
      skipped += 1
      continue
    }
    batch.set(db.collection(PUBLIC_PROFILES).doc(doc.id), profile)
    written += 1
    pending += 1
    if (pending >= BATCH_LIMIT) {
      await batch.commit()
      batch = db.batch()
      pending = 0
    }
  }
  if (pending > 0) await batch.commit()

  logger.info('[publicProfiles] backfill complete', { written, skipped })
  return { written, skipped, total: snap.size }
})
