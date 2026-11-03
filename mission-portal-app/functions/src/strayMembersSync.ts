import * as admin from 'firebase-admin'
import { onCall } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import { requireOwner } from './owner'
import {
  groupsWithout,
  isPublicOnly,
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

/** A profile, as far as this needs it. */
type Profile = { roles?: unknown; displayName?: unknown }

/** A public account still named in a group or common team: by name, for the check to show. */
export interface PublicMember {
  uid: string
  name: string
  in: string[]
}

/**
 * Groups' and common teams' members who don't belong there (./accountAudit):
 * uids with no profile and no account, and accounts made public since they
 * were put there.
 */
export async function findStrays(
  db: Db,
  known?: { profiles: Map<string, Profile>; accounts: Set<string> }
): Promise<{
  strays: StrayMember[]
  publicMembers: PublicMember[]
  groups: GroupDocLike[]
  teams: unknown
}> {
  const [groupsSnap, main, profiles, accounts] = await Promise.all([
    db.collection('groups').get(),
    db.doc('config/main').get(),
    known
      ? Promise.resolve(known.profiles)
      : db
          .collection('users')
          .get()
          .then((s) => new Map(s.docs.map((d) => [d.id, d.data() as Profile]))),
    known ? Promise.resolve(known.accounts) : authUids(),
  ])
  const groups = groupsSnap.docs.map((d) => ({
    ...(d.data() as Omit<GroupDocLike, 'id'>),
    id: d.id,
  }))
  const teams = main.data()?.COMMON_TEAMS
  const strays = strayMembers(groups, teams, (uid) => profiles.has(uid) || accounts.has(uid))
  const publicMembers = strayMembers(
    groups,
    teams,
    (uid) => !(profiles.has(uid) && isPublicOnly(profiles.get(uid)?.roles))
  ).map((m) => ({ ...m, name: String(profiles.get(m.uid)?.displayName || '') || m.uid }))
  return { strays, publicMembers, groups, teams }
}

/**
 * Both taken out of every group and common team — and a public account out
 * of its group chats too, as made public now is (leaveGroupsWhenPublic).
 * How many were.
 */
export async function removeStrays(db: Db): Promise<number> {
  const { strays, publicMembers, groups, teams } = await findStrays(db)
  const gone = new Set([...strays, ...publicMembers].map((s) => s.uid))
  if (!gone.size) return 0
  await takeOutOfGroups(db, gone, groups, teams)
  for (const m of publicMembers) await takeOutOfGroupChats(db, m.uid)
  logger.info('[strayMembers] removed', { uids: [...gone] })
  return gone.size
}

/** These uids out of every group and common team: only what changes is written. */
export async function takeOutOfGroups(
  db: Db,
  gone: Set<string>,
  groups?: GroupDocLike[],
  teams?: unknown
): Promise<void> {
  const g =
    groups ??
    (await db.collection('groups').get()).docs.map((d) => ({
      ...(d.data() as Omit<GroupDocLike, 'id'>),
      id: d.id,
    }))
  const t = teams === undefined ? (await db.doc('config/main').get()).data()?.COMMON_TEAMS : teams
  const batch = db.batch()
  let writes = 0
  for (const next of groupsWithout(g, gone)) {
    batch.update(db.doc(`groups/${next.id}`), { members: next.members })
    writes++
  }
  const nextTeams = teamsWithoutAll(t, gone)
  if (nextTeams) {
    batch.update(db.doc('config/main'), { COMMON_TEAMS: nextTeams })
    writes++
  }
  if (writes) await batch.commit()
}

/**
 * An account made public — a member moved to a follower — leaves every group
 * and common team: they are the team's, and its uid left in one was counted
 * there, shown as a bare id, and put on that group's events.
 */
export const leaveGroupsWhenPublic = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!after || !isPublicOnly(after.roles) || (before && isPublicOnly(before.roles))) return
  const db = admin.firestore()
  await takeOutOfGroups(db, new Set([event.params.uid]))
  const chats = await takeOutOfGroupChats(db, event.params.uid)
  logger.info('[leaveGroupsWhenPublic] out of groups', { uid: event.params.uid, chats })
})

/**
 * Out of the team's group chats: a public account has no Messages, and was
 * left able to read them. A direct message — two people — is left as it is:
 * taken out, the other would be left talking to no one.
 */
export async function takeOutOfGroupChats(db: Db, uid: string): Promise<number> {
  const rooms = await db.collection('rooms').where('members', 'array-contains', uid).get()
  let n = 0
  for (const r of rooms.docs) {
    const room = r.data() as { kind?: string; members?: unknown[] }
    const group = room.kind === 'group' || (room.kind !== 'dm' && (room.members?.length ?? 0) > 2)
    if (!group) continue
    await r.ref.update({ members: admin.firestore.FieldValue.arrayRemove(uid) })
    n++
  }
  return n
}

/** The account check's "Remove them": owner-only, as the check is. */
export const removeStrayMembers = onCall(async (req) => {
  requireOwner(req.auth?.uid)
  const removed = await removeStrays(admin.firestore())
  return { removed }
})
