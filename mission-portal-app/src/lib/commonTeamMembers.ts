import { sameId } from './ids'

/**
 * Common teams as they are kept (config/main COMMON_TEAMS) — a name, or a
 * name and its members' uids — with `uid` taken out of every one; null when
 * no team had them, so nothing need be written.
 */
export function teamsWithout(teams: unknown, uid: string): unknown[] | null {
  if (!Array.isArray(teams)) return null
  let changed = false
  const next = teams.map((t) => {
    const members = (t as { members?: unknown })?.members
    if (!Array.isArray(members) || !members.some((m) => sameId(m, uid))) return t
    changed = true
    return { ...(t as object), members: members.filter((m) => !sameId(m, uid)) }
  })
  return changed ? next : null
}

/**
 * The members who still have an account: a team kept from before an account
 * was deleted still names its uid. All of them while the people haven't
 * loaded, rather than none.
 */
export function stillHere<T>(members: T[], users: { uid: string | number }[]): T[] {
  if (users.length === 0) return members
  return members.filter((m) => users.some((u) => sameId(u.uid, m)))
}
