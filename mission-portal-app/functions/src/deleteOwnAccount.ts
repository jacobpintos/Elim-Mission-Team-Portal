import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

/**
 * Lets a signed-in user permanently delete their own account and personal data.
 *
 * Required by App Store Review Guideline 5.1.1(v): any app that offers account
 * creation must offer account deletion from inside the app, without the user
 * having to contact support.
 *
 * The caller must have re-authenticated on the client immediately before
 * calling this (Firebase requires a fresh credential for sensitive operations,
 * and it keeps a stolen session from nuking the account).
 *
 * Content the user contributed to shared team records (events, tasks, audit
 * entries) is not deleted — it is de-identified by removing them from
 * membership lists. Their chat messages are removed outright.
 */
export const deleteOwnAccount = onCall(async (req) => {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const db = admin.firestore()
  const userSnap = await db.doc(`users/${uid}`).get()
  const email = userSnap.data()?.email ?? null
  const displayName = userSnap.data()?.displayName ?? null

  // 1. Chat messages authored by this user, across every room they belonged to.
  try {
    const rooms = await db.collection('rooms').where('members', 'array-contains', uid).get()
    for (const room of rooms.docs) {
      const mine = await room.ref.collection('messages').where('uid', '==', uid).get()
      let batch = db.batch()
      let n = 0
      for (const msg of mine.docs) {
        batch.delete(msg.ref)
        if (++n === 400) {
          await batch.commit()
          batch = db.batch()
          n = 0
        }
      }
      if (n > 0) await batch.commit()
      // Drop them from the room roster so the room stops listing a ghost member.
      await room.ref.update({ members: admin.firestore.FieldValue.arrayRemove(uid) })
    }
  } catch (err) {
    logger.error(`deleteOwnAccount: failed clearing messages for ${uid}`, err)
  }

  // 2. Per-user documents keyed by uid.
  for (const path of [`notifs/${uid}`, `onboarding/${uid}`, `users/${uid}`]) {
    try {
      await db.doc(path).delete()
    } catch (err) {
      logger.error(`deleteOwnAccount: failed deleting ${path}`, err)
    }
  }

  // 3. Avatar.
  try {
    await admin.storage().bucket().file(`avatars/${uid}`).delete({ ignoreNotFound: true })
  } catch (err) {
    logger.error(`deleteOwnAccount: failed deleting avatar for ${uid}`, err)
  }

  // 4. Audit trail — written before the Auth record goes away so the actor is
  //    still resolvable.
  try {
    await db.collection('auditLog').add({
      action: 'user.selfDeleted',
      actorUid: uid,
      targetUid: uid,
      targetEmail: email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: { displayName, source: 'in-app account deletion' },
    })
  } catch (err) {
    logger.error(`deleteOwnAccount: failed writing audit entry for ${uid}`, err)
  }

  // 5. The Auth record itself. This is the step that must not fail silently —
  //    if it throws, the client keeps the account and shows an error.
  await admin.auth().deleteUser(uid)

  return { ok: true }
})
