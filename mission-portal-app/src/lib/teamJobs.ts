import { ORG, type OrgModule } from '@/custom'
import { orgCan, type AppFeature } from '@/lib/entitlements'
import { isGuest, isWorship } from '@/lib/roles'
import type { UserProfile } from '@/types/user'

/**
 * Jobs several people can hold, given on Admin → Leadership Team:
 *
 * - Sound Engineers may tell Miriam to change the sound desk (src/lib/mixer).
 * - Video Operators may tell Miriam to switch cameras (src/lib/switcher).
 *
 * Kept in config (connectConfig) beside the Connections Coordinator and the
 * Accountant, not on the leadership team, so holding one doesn't put anyone
 * on the church's pages or the meeting form.
 *
 * A job is there only where the organization can use what it works
 * (lib/entitlements): no Sound Engineers where there's no sound desk.
 */

export type TeamJob = 'soundEngineers' | 'videoOperators'

export const TEAM_JOBS: Record<TeamJob, { one: string; does: string; needs: AppFeature }> = {
  soundEngineers: { one: 'Sound Engineer', does: 'change the sound desk', needs: 'soundDesk' },
  videoOperators: { one: 'Video Operator', does: 'switch cameras', needs: 'videoSwitcher' },
}

/** The jobs the organization has: those whose equipment and plan it has. */
export const orgJobs = (org: OrgModule = ORG): TeamJob[] =>
  (Object.keys(TEAM_JOBS) as TeamJob[]).filter((job) => orgCan(TEAM_JOBS[job].needs, org))

/** Whether this person does a job here: the organization has it, and they hold it. */
export const doesJob = (
  job: TeamJob,
  uid: string | undefined,
  holders: readonly string[],
  org: OrgModule = ORG
) => orgCan(TEAM_JOBS[job].needs, org) && holdsJob(uid, holders)

/** A job's holders as stored: uids only, each once. */
export function jobHoldersOf(stored: unknown): string[] {
  if (!Array.isArray(stored)) return []
  const out: string[] = []
  for (const v of stored) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

export const holdsJob = (uid: string | undefined, holders: readonly string[]) =>
  !!uid && holders.includes(uid)

/** The holders with this person given the job, or with it taken back if they held it. */
export function toggledJob(holders: readonly string[], uid: string): string[] {
  return holders.includes(uid) ? holders.filter((h) => h !== uid) : [...holders, uid]
}

/**
 * Who may change their own in-ears (Worship → In-ear Adjustment): the worship
 * team and guests along to sing or play, and the Sound Engineers and admins
 * who look after them. Only where the organization has a sound desk.
 */
export function canAdjustInEars(
  profile: UserProfile | null,
  engineers: readonly string[],
  org: OrgModule = ORG
): boolean {
  if (!profile || !orgCan('soundDesk', org)) return false
  return isWorship(profile) || isGuest(profile) || holdsJob(String(profile.uid ?? ''), engineers)
}
