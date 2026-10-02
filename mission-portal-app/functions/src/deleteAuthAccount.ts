import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { requireOwner } from './owner'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export const deleteAuthAccount = onCall(async (req) => {
  // Owner-only. Deletes Auth accounts in bulk.
  requireOwner(req.auth?.uid)

  const { uids } = req.data as { uids: string[] }
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError('invalid-argument', 'uids array is required')
  }

  const result = await admin.auth().deleteUsers(uids)

  // Their private chord-sheet notes go with the accounts: nobody else can
  // read them, so left behind they would be kept for no one.
  const failed = new Set(result.errors.map((e) => uids[e.index]))
  const db = admin.firestore()
  await Promise.all(
    uids
      .filter((uid) => !failed.has(uid))
      .map((uid) =>
        db
          .doc(`sheetNotes/${uid}`)
          .delete()
          .catch(() => {})
      )
  )
  return {
    deleted: uids.length - result.errors.length,
    errors: result.errors.map((e) => ({ uid: uids[e.index], message: e.error.message })),
  }
})
