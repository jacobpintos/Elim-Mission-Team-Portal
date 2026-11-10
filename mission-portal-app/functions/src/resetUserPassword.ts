import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireAdmin, refuseIfOwnerTarget } from './owner'
import { showsPassword, temporaryPassword, UPDATE_TO_RESET } from './temporaryPassword'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

/**
 * Someone's password set to a new temporary one, by an admin: made at random
 * (./temporaryPassword) and sent back to the admin's app, which shows it to
 * them once, to pass on. Changing it signs the account out everywhere else.
 */
export const resetUserPassword = onCall(async (req) => {
  await requireAdmin(req.auth?.uid)

  const { uid } = req.data as { uid: string }
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required')
  refuseIfOwnerTarget(uid, req.auth?.uid)
  if (!showsPassword(req.data)) throw new HttpsError('failed-precondition', UPDATE_TO_RESET)

  const password = temporaryPassword()
  try {
    await admin.auth().updateUser(uid, { password })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No Auth account found for this user')
    }
    throw new HttpsError('internal', 'Failed to reset password')
  }

  return { success: true, password }
})
