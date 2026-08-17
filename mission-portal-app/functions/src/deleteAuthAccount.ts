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
  return {
    deleted: uids.length - result.errors.length,
    errors: result.errors.map((e) => ({ uid: uids[e.index], message: e.error.message })),
  }
})
