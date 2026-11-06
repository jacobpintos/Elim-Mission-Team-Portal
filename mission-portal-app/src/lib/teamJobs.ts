/**
 * Jobs several people can hold, given on Admin → Leadership Team:
 *
 * - Sound Engineers may tell Miriam to change the sound desk (src/lib/mixer).
 * - Video Operators may tell Miriam to switch cameras (src/lib/switcher).
 *
 * Kept in config (connectConfig) beside the Connections Coordinator and the
 * Accountant, not on the leadership team, so holding one doesn't put anyone
 * on the church's pages or the meeting form.
 */

export type TeamJob = 'soundEngineers' | 'videoOperators'

export const TEAM_JOBS: Record<TeamJob, { one: string; does: string }> = {
  soundEngineers: { one: 'Sound Engineer', does: 'change the sound desk' },
  videoOperators: { one: 'Video Operator', does: 'switch cameras' },
}

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
