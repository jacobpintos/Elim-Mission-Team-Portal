import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const createPortalUser = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const callerSnap = await admin.firestore().collection('users').doc(req.auth.uid).get()
  const callerRoles: string[] = callerSnap.data()?.roles ?? []
  if (!callerRoles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')
  const { name, email, password, recoveryEmail, roles } = req.data as {
    name: string
    email: string
    password: string
    recoveryEmail?: string
    roles: string[]
  }
  let userRecord: admin.auth.UserRecord
  try {
    userRecord = await admin.auth().createUser({ displayName: name, email, password })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', `An account with email ${email} already exists`)
    }
    if (code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'Invalid email address')
    }
    throw new HttpsError('internal', 'Failed to create user')
  }
  await admin.firestore().collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    displayName: name,
    recoveryEmail: recoveryEmail || email,
    roles,
    onboardingComplete: true,
    notificationPrefs: {
      newAssignment: { push: true, email: false },
      newMessage: { push: true, email: false },
      eventReminder: { push: true, email: true },
      announcement: { push: true, email: false },
      issueAssigned: { push: true, email: false },
      weeklyDigest: !roles.includes('public'),
      monthlyDigest: false,
      publicAnnouncement: { push: true, email: false },
      publicEvent: { push: true, email: false },
      contentFeatured: { push: true, email: false },
    },
    pushTokens: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { uid: userRecord.uid }
})
