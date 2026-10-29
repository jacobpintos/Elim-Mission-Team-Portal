/**
 * Every event's records put right, availability records too
 * (../eventPrivateSync settleAll) — run by the deploy, after the functions
 * and before the rules, so that who may see each event is written on it
 * before the rules start reading it.
 *
 *   node functions/lib/scripts/settleAll.js
 *
 * With the deploy's credentials (GOOGLE_APPLICATION_CREDENTIALS) and project
 * (GCLOUD_PROJECT); against the emulator with FIRESTORE_EMULATOR_HOST.
 */
import * as admin from 'firebase-admin'
import { settleAll } from '../eventPrivateSync'

if (!admin.apps.length) admin.initializeApp()

settleAll(admin.firestore(), { avail: true })
  .then(({ events, settled, availStamped, draftsFound }) => {
    console.log(
      `Settled ${settled} of ${events} events; told ${availStamped} availability records who may see them; found the makers of ${draftsFound} drafts.`
    )
    process.exit(0)
  })
  .catch((err) => {
    console.error('Settling events failed:', err)
    process.exit(1)
  })
