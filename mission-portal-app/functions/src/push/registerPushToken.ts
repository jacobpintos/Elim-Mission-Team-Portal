import { HttpsError, onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

const PLATFORMS = ['ios', 'android', 'web']

/**
 * This device's push token kept on its owner's record, or cleared (null) when
 * they sign out or turn notifications off (src/lib/notifications).
 *
 * `platform` names a field of their record, so it is one of the three the
 * app has and nothing else: it used to be written as it came.
 */
export const registerPushToken = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const { token, platform } = (req.data ?? {}) as { token?: unknown; platform?: unknown }
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform)) {
    throw new HttpsError('invalid-argument', 'Which kind of device?')
  }
  if (token != null && (typeof token !== 'string' || token.length > 400)) {
    throw new HttpsError('invalid-argument', 'That isn’t a push token.')
  }
  const uid = req.auth.uid

  await admin.firestore().doc(`users/${uid}`).update({
    [`pushTokens.${platform}`]: token ?? null,
  })

  return { ok: true }
})
