import { describe, it, expect } from 'vitest'
import { FULL_EVERY_MS, OVERLAP_MS, sweepPlan } from '../../functions/src/sweepPlan'

/** The half-hourly event sweep: everything once a day, otherwise only what was written since. */
describe('what the event sweep reads', () => {
  const now = 1_800_000_000_000

  it('reads everything the first time, and when what it kept makes no sense', () => {
    expect(sweepPlan(undefined, now)).toEqual({ kind: 'full' })
    expect(sweepPlan({}, now)).toEqual({ kind: 'full' })
    expect(sweepPlan({ fullAt: now - 1000 }, now)).toEqual({ kind: 'full' })
    // A time to come: a clock set wrong once, say.
    expect(sweepPlan({ fullAt: now + 1000, at: now - 1000 }, now)).toEqual({ kind: 'full' })
    expect(sweepPlan({ fullAt: now - 1000, at: now + 1000 }, now)).toEqual({ kind: 'full' })
  })

  it('reads everything again once a day has passed', () => {
    expect(sweepPlan({ fullAt: now - FULL_EVERY_MS, at: now - 1000 }, now)).toEqual({
      kind: 'full',
    })
  })

  it('otherwise reads what was written since it last ran, looking back a little further', () => {
    const at = now - 30 * 60 * 1000
    expect(sweepPlan({ fullAt: now - 5 * 60 * 60 * 1000, at }, now)).toEqual({
      kind: 'since',
      since: at - OVERLAP_MS,
    })
  })
})
