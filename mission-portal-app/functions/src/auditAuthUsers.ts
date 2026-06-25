import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

export type OrphanFirestoreDoc = {
  uid: string
  displayName?: string
  email?: string
  roles?: string[]
}

export type OrphanAuthAccount = {
  uid: string
  email: string
  displayName: string
}

export const auditAuthUsers = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const callerSnap = await admin.firestore().collection('users').doc(req.auth.uid).get()
  const callerRoles: string[] = callerSnap.data()?.roles ?? []
  if (!callerRoles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')

  // Page through all Auth users
  const authUsers: OrphanAuthAccount[] = []
  let pageToken: string | undefined
  do {
    const result = await admin.auth().listUsers(1000, pageToken)
    result.users.forEach((u) => {
      authUsers.push({ uid: u.uid, email: u.email ?? '', displayName: u.displayName ?? '' })
    })
    pageToken = result.pageToken
  } while (pageToken)

  // Get all Firestore user docs
  const fsSnap = await admin.firestore().collection('users').get()
  const fsUids = new Set(fsSnap.docs.map((d) => d.id))
  const authUids = new Set(authUsers.map((u) => u.uid))

  const orphanFirestore: OrphanFirestoreDoc[] = fsSnap.docs
    .filter((d) => !authUids.has(d.id))
    .map((d) => {
      const data = d.data()
      return {
        uid: d.id,
        displayName: data.displayName ?? data.name ?? undefined,
        email: data.email ?? undefined,
        roles: data.roles ?? undefined,
      }
    })

  const orphanAuth: OrphanAuthAccount[] = authUsers.filter((u) => !fsUids.has(u.uid))

  return { orphanFirestore, orphanAuth }
})
