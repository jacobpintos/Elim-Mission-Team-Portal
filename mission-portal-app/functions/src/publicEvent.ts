import * as admin from 'firebase-admin'
import { onCall } from 'firebase-functions/v2/https'
import { keyParts, publicEventView } from './publicEventView'

if (!admin.apps.length) admin.initializeApp()

/**
 * A public event's date, as anyone may see it — signed in or not: what an
 * invitation's link opens (app/(public)/invite/[key]). Null for anything
 * that isn't a public event's date (./publicEventView).
 */
export const publicEvent = onCall(async (request) => {
  const key = typeof request.data?.key === 'string' ? request.data.key.slice(0, 200) : ''
  const parts = keyParts(key)
  if (!parts) return null
  const snap = await admin.firestore().doc(`events/${parts.id}`).get()
  if (!snap.exists) return null
  return publicEventView(snap.data() ?? {}, parts.id, key)
})
