import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { rolesClaim, sameRoles } from './rolesClaim'

if (!admin.apps.length) admin.initializeApp()

/**
 * A person's roles carried in their sign-in token (./rolesClaim), kept the
 * same as their record: set whenever the record is written, if they differ.
 *
 * Every write to it counts — the app stamps lastLoginAt as it opens — so
 * anyone using the app has the claim from their first opening after this is
 * deployed, with nothing to run by hand. Until their token has it, the
 * rules read their record, as they always did.
 *
 * The roles are read afresh, not taken from the write that set this off: two
 * writes close together could otherwise finish out of order and leave the
 * claim saying the older.
 *
 * Their app asks for a new token once their record's roles change, and
 * holds the change back until the token agrees (src/stores/authStore), so
 * what they are shown and what the rules let them do change together.
 *
 * A record removed: the claim goes with it. The token they hold keeps it
 * until it runs out, within the hour; admin power never was the token's
 * alone to give (../firestore.rules isAdmin).
 */
export const syncRoleClaims = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid
  let user: admin.auth.UserRecord
  try {
    user = await admin.auth().getUser(uid)
  } catch (err) {
    // A record with no sign-in (made by hand, or the sign-in removed first).
    if ((err as { code?: string }).code === 'auth/user-not-found') return
    throw err
  }
  const claims = (user.customClaims ?? {}) as Record<string, unknown>
  const record = await admin.firestore().doc(`users/${uid}`).get()
  if (!record.exists) {
    if (!('roles' in claims)) return
    const { roles: _gone, ...rest } = claims
    await admin.auth().setCustomUserClaims(uid, Object.keys(rest).length ? rest : null)
    logger.info('syncRoleClaims: record removed, roles taken out of the token', { uid })
    return
  }
  const roles = record.data()?.roles
  if (sameRoles(claims.roles, roles)) return
  await admin.auth().setCustomUserClaims(uid, { ...claims, roles: rolesClaim(roles) })
  logger.info('syncRoleClaims: roles put in the token', { uid })
})
