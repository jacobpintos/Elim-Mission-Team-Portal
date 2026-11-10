import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireOwner } from './owner'
import { showsPassword, temporaryPassword, UPDATE_TO_RESET } from './temporaryPassword'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export type CreateAuthResult = {
  uid: string
  email: string
  displayName: string
  status: 'created' | 'already_exists' | 'error'
  error?: string
  /** A login just made: its temporary password, for the owner to pass on. Sent once, kept nowhere. */
  password?: string
}

export const createAuthForOrphans = onCall(async (req) => {
  // Owner-only. Mints logins, each with a temporary password of its own
  // (./temporaryPassword), sent back to be shown once.
  requireOwner(req.auth?.uid)
  if (!showsPassword(req.data)) throw new HttpsError('failed-precondition', UPDATE_TO_RESET)

  const { uids } = req.data as { uids: string[] }
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError('invalid-argument', 'uids array is required')
  }

  const results: CreateAuthResult[] = []

  for (const uid of uids) {
    const snap = await admin.firestore().collection('users').doc(uid).get()
    if (!snap.exists) {
      results.push({
        uid,
        email: '',
        displayName: '',
        status: 'error',
        error: 'Firestore doc not found',
      })
      continue
    }

    const data = snap.data()!
    const email = (data.email ?? data.recoveryEmail ?? '').trim()
    const displayName = (data.displayName ?? data.name ?? '').trim()

    if (!email) {
      results.push({
        uid,
        email: '',
        displayName,
        status: 'error',
        error: 'No email address in profile',
      })
      continue
    }

    try {
      const password = temporaryPassword()
      await admin.auth().createUser({
        uid,
        email,
        displayName,
        password,
        emailVerified: true,
      })
      results.push({ uid, email, displayName, status: 'created', password })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/uid-already-exists') {
        results.push({ uid, email, displayName, status: 'already_exists' })
      } else if (code === 'auth/email-already-exists') {
        results.push({
          uid,
          email,
          displayName,
          status: 'error',
          error: `Email already used by a different account`,
        })
      } else {
        results.push({
          uid,
          email,
          displayName,
          status: 'error',
          error: (err as Error).message ?? 'Unknown error',
        })
      }
    }
  }

  return { results }
})
