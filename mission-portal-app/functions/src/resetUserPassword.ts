import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const resetUserPassword = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const callerSnap = await admin.firestore().collection('users').doc(req.auth.uid).get()
  const callerRoles: string[] = callerSnap.data()?.roles ?? []
  if (!callerRoles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')

  const { uid } = req.data as { uid: string }
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required')

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
