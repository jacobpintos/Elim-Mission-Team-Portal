import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireAdmin, refuseIfOwnerTarget } from './owner'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const updateUserEmail = onCall(async (req) => {
  await requireAdmin(req.auth?.uid)

  const { uid, newEmail } = req.data as { uid: string; newEmail: string }
  if (!uid || !newEmail) throw new HttpsError('invalid-argument', 'uid and newEmail are required')
  refuseIfOwnerTarget(uid, req.auth?.uid)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    throw new HttpsError('invalid-argument', 'Invalid email address')
  }

  try {
    await admin.auth().updateUser(uid, { email: newEmail.trim() })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', `${newEmail} is already used by another account`)
    }
    if (code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'Invalid email address')
    }
    if (code === 'auth/user-not-found') {
      // Orphan Firestore doc with no Auth account — skip Auth update, still fix Firestore
    } else {
      throw new HttpsError('internal', 'Failed to update email')
    }
  }

  await admin.firestore().collection('users').doc(uid).update({ email: newEmail.trim() })
  return { success: true }
})
