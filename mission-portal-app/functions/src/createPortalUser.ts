import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const createPortalUser = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const callerSnap = await admin.firestore().collection('users').doc(req.auth.uid).get()
  const callerRoles: string[] = callerSnap.data()?.roles ?? []
  if (!callerRoles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')
  const { name, email, password, recoveryEmail, roles, sex } = req.data as {
    name: string
    email: string
    password: string
    recoveryEmail?: string
    roles: string[]
    /** Colours their card when a carpool is arranged (UserProfile.sex in the app). */
    sex?: unknown
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
    // Only either of the two, and absent rather than blank when not given.
    ...(sex === 'male' || sex === 'female' ? { sex } : {}),
    onboardingComplete: true,
    notificationPrefs: {
      newAssignment: { push: true },
      newMessage: { push: true },
      eventReminder: { push: true },
      announcement: { push: true },
      issueAssigned: { push: true },
      eventJoin: { push: true },
      eventRemoved: { push: true },
      worshipSetAssigned: { push: true },
      taskDueSoon: { push: true },
      rsvpNonAvailable: { push: true },
      kaizenSubmission: { push: true },
      issueSubmission: { push: true },
      eventHealthBehind: { push: true },
      chatFlagged: { push: true },
      securityReport: { push: true },
      securityReportUrgent: true,
      weatherAlertAdmin: { push: true },
      textingListSignup: { push: true },
      // Keep in step with defaultNotificationPrefs() in
      // mission-portal-app/src/types/user.ts — this package is a separate
      // TypeScript project and cannot import it. An account made without one
      // of these keys still gets the push (see pushEnabled in
      // push/notifyCore.ts), but its Settings toggle would read on with
      // nothing stored behind it.
      eventLogistics: { push: true },
      flightReminder: { push: true },
      foodSignupOpen: { push: true },
      foodSignupReminder: { push: true },
      publicAnnouncement: { push: true },
      publicEvent: { push: true },
      contentFeatured: { push: true },
    },
    pushTokens: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { uid: userRecord.uid }
})
