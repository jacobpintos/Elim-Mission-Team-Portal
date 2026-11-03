import { onCall } from 'firebase-functions/v2/https'
import { requireOwner } from './owner'
import * as admin from 'firebase-admin'

import { isBlank } from './accountAudit'
import { findStrays } from './strayMembersSync'

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

/**
 * An account with nothing to know it by — no name, no email — and what its
 * sign-in account says of it, so an admin can tell what it is.
 */
export type BlankAccount = {
  uid: string
  roles?: string[]
  /** Its sign-in account: how it signs in, when it was made and last used. Null: none. */
  auth: {
    email: string
    phone: string
    providers: string[]
    created: string
    lastSignIn: string
    disabled: boolean
  } | null
}

export const auditAuthUsers = onCall(async (req) => {
  // Owner-only. Lists every Auth account in the project.
  requireOwner(req.auth?.uid)

  // Page through all Auth users
  const authUsers: OrphanAuthAccount[] = []
  const records = new Map<string, admin.auth.UserRecord>()
  let pageToken: string | undefined
  do {
    const result = await admin.auth().listUsers(1000, pageToken)
    result.users.forEach((u) => {
      authUsers.push({ uid: u.uid, email: u.email ?? '', displayName: u.displayName ?? '' })
      records.set(u.uid, u)
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

  // Profiles with no name and no email: shown elsewhere as their bare uid.
  const blankAccounts: BlankAccount[] = fsSnap.docs
    .filter((d) => isBlank(d.data()))
    .map((d) => {
      const r = records.get(d.id)
      return {
        uid: d.id,
        roles: d.data().roles ?? undefined,
        auth: r
          ? {
              email: r.email ?? '',
              phone: r.phoneNumber ?? '',
              providers: r.providerData.map((p) => p.providerId),
              created: r.metadata.creationTime ?? '',
              lastSignIn: r.metadata.lastSignInTime ?? '',
              disabled: r.disabled,
            }
          : null,
      }
    })

  // Group and common-team members with no profile and no account (./accountAudit).
  // And public accounts still named in them, made public since they were put there.
  const { strays: strayMembers, publicMembers } = await findStrays(admin.firestore(), {
    profiles: new Map(fsSnap.docs.map((d) => [d.id, d.data()])),
    accounts: authUids,
  })

  return { orphanFirestore, orphanAuth, blankAccounts, strayMembers, publicMembers }
})
