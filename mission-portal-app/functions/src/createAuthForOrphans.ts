import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireOwner } from './owner'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export type CreateAuthResult = {
  uid: string
  email: string
  displayName: string
  status: 'created' | 'already_exists' | 'error'
  error?: string
}

export const createAuthForOrphans = onCall(async (req) => {
  // Owner-only. Mints logins with a known default password.
  requireOwner(req.auth?.uid)

  const { uids } = req.data as { uids: string[] }
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError('invalid-argument', 'uids array is required')
  }

  const results: CreateAuthResult[] = []

  for (const uid of uids) {
    const snap = await admin.firestore().collection('users').doc(uid).get()
    if (!snap.exists) {
      results.push({ uid, email: '', displayName: '', status: 'error', error: 'Firestore doc not found' })
      continue
    }

    const data = snap.data()!
    const email = (data.email ?? data.recoveryEmail ?? '').trim()
    const displayName = (data.displayName ?? data.name ?? '').trim()

    if (!email) {
      results.push({ uid, email: '', displayName, status: 'error', error: 'No email address in profile' })
      continue
    }

    try {
      await admin.auth().createUser({
        uid,
        email,
        displayName,
        password: '12345678',
        emailVerified: true,
      })
      results.push({ uid, email, displayName, status: 'created' })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/uid-already-exists') {
        results.push({ uid, email, displayName, status: 'already_exists' })
      } else if (code === 'auth/email-already-exists') {
        results.push({ uid, email, displayName, status: 'error', error: `Email already used by a different account` })
      } else {
        results.push({ uid, email, displayName, status: 'error', error: (err as Error).message ?? 'Unknown error' })
      }
    }
  }

  return { results }
})
