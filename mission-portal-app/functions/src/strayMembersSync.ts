import * as admin from 'firebase-admin'
import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { requireOwner } from './owner'
import {
  groupsWithout,
  strayMembers,
  teamsWithoutAll,
  type GroupDocLike,
  type StrayMember,
} from './accountAudit'

if (!admin.apps.length) admin.initializeApp()

type Db = admin.firestore.Firestore

/** Every sign-in account's uid. */
export async function authUids(): Promise<Set<string>> {
  const uids = new Set<string>()
  let pageToken: string | undefined
  do {
    const page = await admin.auth().listUsers(1000, pageToken)
    page.users.forEach((u) => uids.add(u.uid))
    pageToken = page.pageToken
  } while (pageToken)
  return uids
}

/** Groups' and common teams' members with no profile and no account (./accountAudit). */
export async function findStrays(
  db: Db,
  known?: { profiles: Set<string>; accounts: Set<string> }
): Promise<{ strays: StrayMember[]; groups: GroupDocLike[]; teams: unknown }> {
  const [groupsSnap, main, profiles, accounts] = await Promise.all([
    db.collection('groups').get(),
    db.doc('config/main').get(),
    known
      ? Promise.resolve(known.profiles)
      : db
          .collection('users')
          .get()
          .then((s) => new Set(s.docs.map((d) => d.id))),
    known ? Promise.resolve(known.accounts) : authUids(),
  ])
  const groups = groupsSnap.docs.map((d) => ({
    ...(d.data() as Omit<GroupDocLike, 'id'>),
    id: d.id,
  }))
  const teams = main.data()?.COMMON_TEAMS
  const strays = strayMembers(groups, teams, (uid) => profiles.has(uid) || accounts.has(uid))
  return { strays, groups, teams }
}

/** Them taken out of every group and common team. How many were. */
export async function removeStrays(db: Db): Promise<number> {
  const { strays, groups, teams } = await findStrays(db)
  if (!strays.length) return 0
  const gone = new Set(strays.map((s) => s.uid))
  const batch = db.batch()
  for (const g of groupsWithout(groups, gone))
    batch.update(db.doc(`groups/${g.id}`), { members: g.members })
  const nextTeams = teamsWithoutAll(teams, gone)
  if (nextTeams) batch.update(db.doc('config/main'), { COMMON_TEAMS: nextTeams })
  await batch.commit()
  logger.info('[strayMembers] removed', { uids: [...gone] })
  return gone.size
}

/** The account check's "Remove them": owner-only, as the check is. */
export const removeStrayMembers = onCall(async (req) => {
  requireOwner(req.auth?.uid)
  const removed = await removeStrays(admin.firestore())
  return { removed }
})
