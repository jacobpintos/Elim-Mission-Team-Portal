/**
 * What a safety-net sweep looks at this time: everything, or only what was
 * written since it last looked.
 *
 * A sweep that reads every record each time it runs — every half hour, say —
 * costs as much as the records it keeps, forty-eight times a day, to find
 * the few that were written. So it looks only at what changed since it last
 * ran, with some overlap for writes that land late, and reads everything
 * once a day, for anything a write didn't mark as changed.
 *
 * Kept free of Firebase, for tests (src/lib/sweepPlan.test.ts in the app).
 */

export interface SweepState {
  /** When it last read everything, in ms. */
  fullAt?: number
  /** When it last ran at all, in ms. */
  at?: number
}

export type SweepPlan = { kind: 'full' } | { kind: 'since'; since: number }

/** How often everything is read. */
export const FULL_EVERY_MS = 24 * 60 * 60 * 1000

/**
 * Looked back past the last run by this much: a write stamped with the
 * server's time just before the last run read, but not visible to it yet,
 * is still found.
 */
export const OVERLAP_MS = 60 * 60 * 1000

export function sweepPlan(state: SweepState | undefined, now: number): SweepPlan {
  const fullAt = typeof state?.fullAt === 'number' ? state.fullAt : null
  const at = typeof state?.at === 'number' ? state.at : null
  // Never read everything, or not for a day, or something is wrong with what
  // was kept (a time to come): read everything.
  if (fullAt === null || at === null || fullAt > now || at > now) return { kind: 'full' }
  if (now - fullAt >= FULL_EVERY_MS) return { kind: 'full' }
  return { kind: 'since', since: Math.min(at, now) - OVERLAP_MS }
}
