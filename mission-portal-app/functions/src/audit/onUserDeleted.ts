import * as admin from 'firebase-admin'
import { auth } from 'firebase-functions/v1'
import { logger } from 'firebase-functions'

/**
 * Writes an audit log entry when a Firebase Auth user is deleted.
 * This covers both admin-initiated deletes and account deletions.
 */
export const onUserDeleted = auth.user().onDelete(async (user) => {
  logger.info(`User deleted: ${user.uid}`)

  try {
    await admin.firestore().collection('auditLog').add({
      action: 'user.deleted',
      actorUid: null, // server-initiated
      targetUid: user.uid,
      targetEmail: user.email ?? null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        displayName: user.displayName ?? null,
        provider: user.providerData.map((p) => p.providerId),
      },
    })
  } catch (err) {
    logger.error('Failed to write audit log for user deletion', err)
  }
})
