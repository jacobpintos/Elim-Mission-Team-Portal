import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const createPortalUser = onCall(async (req) => {
  if (!req.auth?.token.admin) throw new HttpsError('permission-denied', 'Admins only')
  const { name, email, password, recoveryEmail, roles } = req.data as {
    name: string
    email: string
    password: string
    recoveryEmail?: string
    roles: string[]
  }
  const userRecord = await admin.auth().createUser({ displayName: name, email, password })
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
    },
    pushTokens: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { uid: userRecord.uid }
})
