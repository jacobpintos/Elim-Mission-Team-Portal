import { describe, expect, it, vi } from 'vitest'
import {
  counted,
  withinLimit,
  type LimitDb,
  type UsageLimit,
} from '../../functions/src/utils/usageLimit'

/**
 * The limit on how often one person may call what costs to run
 * (functions/src/utils/usageLimit): one count for every copy of the server.
 */

const LIMIT: UsageLimit = { name: 'askMiriam', perWindow: 3, windowMs: 10 * 60 * 1000 }
const MIN = 60 * 1000

/** Firestore, in memory: one document per path. */
function memoryDb(): LimitDb & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>()
  return {
    docs,
    doc: (path: string) => path,
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ({ data: () => docs.get(ref as string) }),
        set: (ref, d) => docs.set(ref as string, d),
      }),
  }
}

/** Firestore that can't be reached. */
const downDb: LimitDb = {
  doc: (path: string) => path,
  runTransaction: async () => {
    throw new Error('unavailable')
  },
}

describe('counted', () => {
  it('keeps the calls still in the window, with this one, while there is room', () => {
    expect(counted(undefined, 1000, LIMIT)).toEqual([1000])
    expect(counted([1, 2], 3, LIMIT)).toEqual([1, 2, 3])
    expect(counted([1, 2, 3], 4, LIMIT)).toBeNull()
  })

  it('lets calls leave the window, and passes over anything that isn’t a time', () => {
    expect(counted([0, 1, 2], 10 * MIN + 2, LIMIT)).toEqual([10 * MIN + 2])
    expect(counted([0, 5 * MIN, 9 * MIN], 10 * MIN, LIMIT)).toEqual([5 * MIN, 9 * MIN, 10 * MIN])
    expect(counted(['1', null, { t: 1 }, 2], 3, LIMIT)).toEqual([2, 3])
    expect(counted('lots', 3, LIMIT)).toEqual([3])
  })
})

describe('withinLimit', () => {
  it('allows each person so many calls in the window, then none until one leaves it', async () => {
    const db = memoryDb()
    const at = (now: number, uid = 'sarah') => withinLimit(db, uid, LIMIT, { now })
    expect([await at(0), await at(MIN), await at(2 * MIN)]).toEqual([true, true, true])
    expect(await at(3 * MIN)).toBe(false)
    // Someone else's count is their own.
    expect(await at(3 * MIN, 'sam')).toBe(true)
    // The first has left the window.
    expect(await at(10 * MIN)).toBe(true)
    expect(await at(10 * MIN + 1)).toBe(false)
  })

  it('keeps only the times, and when they will have passed — not refused calls', async () => {
    const db = memoryDb()
    for (const now of [0, 1, 2, 3]) await withinLimit(db, 'sarah', LIMIT, { now })
    expect(Object.fromEntries(db.docs)).toEqual({
      'usageLimits/askMiriam_sarah': { calls: [0, 1, 2], until: 2 + LIMIT.windowMs },
    })
  })

  it('is one count for every copy of the server, and outlasts a restart', async () => {
    const db = memoryDb()
    for (const now of [0, 1, 2]) await withinLimit(db, 'sarah', LIMIT, { now })
    // Another copy of the server — or this one started again — has counted nothing itself.
    vi.resetModules()
    const fresh = await import('../../functions/src/utils/usageLimit')
    expect(await fresh.withinLimit(db, 'sarah', LIMIT, { now: 3 })).toBe(false)
  })

  it('counts each call by its own name', async () => {
    const db = memoryDb()
    const other = { ...LIMIT, name: 'readTravelImage' }
    for (const now of [0, 1, 2]) await withinLimit(db, 'sarah', LIMIT, { now })
    expect(await withinLimit(db, 'sarah', other, { now: 3 })).toBe(true)
  })

  it('counts on this copy of the server alone when Firestore can’t be reached', async () => {
    const onError = vi.fn()
    const at = (now: number) => withinLimit(downDb, 'ruth', LIMIT, { now, onError })
    expect([await at(0), await at(1), await at(2)]).toEqual([true, true, true])
    expect(await at(3)).toBe(false)
    expect(onError).toHaveBeenCalledTimes(4)
    expect(onError.mock.calls[0][0]).toEqual(new Error('unavailable'))
  })

  it('adds what it allowed on its own to the shared count, once that can be taken again', async () => {
    const db = memoryDb()
    // Firestore taken once, then too busy for the next 19 (contention, say), over and over.
    let n = 0
    const busy: LimitDb = {
      doc: db.doc,
      runTransaction: (fn) => (n++ % 20 === 0 ? db.runTransaction(fn) : downDb.runTransaction(fn)),
    }
    const limit = { ...LIMIT, perWindow: 20 }
    let allowed = 0
    for (let now = 0; now < 200; now++) {
      if (await withinLimit(busy, 'mary', limit, { now })) allowed++
    }
    expect(allowed).toBe(20)
    // What it allowed on its own is in the shared count: another copy sees it.
    expect((db.docs.get('usageLimits/askMiriam_mary')?.calls as number[]).length).toBe(20)
    vi.resetModules()
    const fresh = await import('../../functions/src/utils/usageLimit')
    expect(await fresh.withinLimit(db, 'mary', limit, { now: 200 })).toBe(false)
  })

  it('carries on from what it counted while Firestore could be reached', async () => {
    const db = memoryDb()
    for (const now of [0, 1]) await withinLimit(db, 'eli', LIMIT, { now })
    expect(await withinLimit(downDb, 'eli', LIMIT, { now: 2 })).toBe(true)
    expect(await withinLimit(downDb, 'eli', LIMIT, { now: 3 })).toBe(false)
  })
})
