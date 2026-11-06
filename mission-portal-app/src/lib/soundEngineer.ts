/**
 * The Sound Engineer job (Admin → Leadership Team): who may tell Miriam to
 * change the sound desk (src/lib/mixer). Several people can hold it. Kept in
 * config (connectConfig.soundEngineers) beside the Connections Coordinator and
 * the Accountant, and not on the leadership team, so holding it doesn't put
 * anyone on the church's pages or the meeting form.
 */

/** The holders as stored: uids only, each once. */
export function soundEngineersOf(stored: unknown): string[] {
  if (!Array.isArray(stored)) return []
  const out: string[] = []
  for (const v of stored) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

export const isSoundEngineer = (uid: string | undefined, holders: readonly string[]) =>
  !!uid && holders.includes(uid)

/** The holders with this person given the job, or with it taken back if they held it. */
export function toggledSoundEngineer(holders: readonly string[], uid: string): string[] {
  return holders.includes(uid) ? holders.filter((h) => h !== uid) : [...holders, uid]
}
