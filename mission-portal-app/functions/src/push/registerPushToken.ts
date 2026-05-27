import { onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

export const registerPushToken = onCall(async (req) => {
  if (!req.auth) throw new Error('unauthenticated')

  const { token, platform } = req.data as { token: string | null; platform: string }
  const uid = req.auth.uid

  await admin.firestore().doc(`users/${uid}`).update({
    [`pushTokens.${platform}`]: token ?? null,
  })

  return { ok: true }
})
