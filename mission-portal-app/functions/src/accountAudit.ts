/**
 * What the account check (./auditAuthUsers) finds besides accounts and
 * profiles that don't match: accounts with nothing to know them by, and
 * members of groups and common teams with no account at all.
 *
 * A group names its members by uid. When an account goes some way other
 * than an admin's Delete — a person deleting their own, before that took
 * them out of groups (./deleteOwnAccount), or one removed in the Firebase
 * console — the uid stays behind: counted in the group, shown nowhere.
 *
 * Kept free of Firebase: the app's tests import it.
 */

/** A group as kept: groups/{id}. */
export interface GroupDocLike {
  id: string
  name?: string
  members?: unknown[]
}

/** A common team as kept in config/main COMMON_TEAMS: a name, or a name and its members. */
export type CommonTeamLike = { name?: string; members?: unknown[] } | string

export interface StrayMember {
  uid: string
  /** Where it is named: "All", "Worship Band", "Production (common team)". */
  in: string[]
}

/**
 * Every uid named in a group or common team with no profile and no
 * sign-in account behind it. One with either is a person — an account
 * without a profile is the check's other finding, and fixed there.
 */
export function strayMembers(
  groups: GroupDocLike[],
  teams: CommonTeamLike[] | unknown,
  known: (uid: string) => boolean
): StrayMember[] {
  const found = new Map<string, string[]>()
  const note = (uid: unknown, where: string) => {
    const id = String(uid ?? '')
    if (!id || known(id)) return
    found.set(id, [...(found.get(id) ?? []), where])
  }
  for (const g of groups) for (const m of g.members ?? []) note(m, g.name || g.id)
  for (const t of Array.isArray(teams) ? (teams as CommonTeamLike[]) : []) {
    if (typeof t === 'string') continue
    for (const m of t.members ?? []) note(m, `${t.name || 'A team'} (common team)`)
  }
  return [...found].map(([uid, where]) => ({ uid, in: [...new Set(where)] }))
}

/** Groups' members, with these uids taken out: only the groups that change. */
export function groupsWithout(
  groups: GroupDocLike[],
  uids: Set<string>
): { id: string; members: unknown[] }[] {
  return groups.flatMap((g) => {
    const members = g.members ?? []
    const kept = members.filter((m) => !uids.has(String(m)))
    return kept.length === members.length ? [] : [{ id: g.id, members: kept }]
  })
}

/** Common teams with these uids taken out; null when none had them. */
export function teamsWithoutAll(teams: unknown, uids: Set<string>): unknown[] | null {
  if (!Array.isArray(teams)) return null
  let changed = false
  const next = teams.map((t) => {
    const members = (t as { members?: unknown })?.members
    if (!Array.isArray(members) || !members.some((m) => uids.has(String(m)))) return t
    changed = true
    return { ...(t as object), members: members.filter((m) => !uids.has(String(m))) }
  })
  return changed ? next : null
}

/** A profile with nothing to know it by: no name, and no email. */
export function isBlank(profile: { displayName?: unknown; email?: unknown }): boolean {
  const said = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  return !said(profile.displayName) && !said(profile.email)
}
