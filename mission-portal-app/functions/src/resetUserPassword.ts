import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireAdmin, refuseIfOwnerTarget } from './owner'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const resetUserPassword = onCall(async (req) => {
  await requireAdmin(req.auth?.uid)

  const { uid } = req.data as { uid: string }
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required')
  refuseIfOwnerTarget(uid, req.auth?.uid)

  try {
    await admin.auth().updateUser(uid, { password: '12345678' })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No Auth account found for this user')
    }
    throw new HttpsError('internal', 'Failed to reset password')
  }

  return { success: true }
})
