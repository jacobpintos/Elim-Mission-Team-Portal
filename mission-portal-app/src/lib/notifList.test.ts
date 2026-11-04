import { describe, expect, it } from 'vitest'
import { NOTIFS_KEPT, newestNotifs, withNotif } from '../../functions/src/push/notifList'

const n = (ts: number) => ({ id: `n${ts}`, ts, msg: '', read: true })

describe('a person’s notification list', () => {
  it('takes a new one, as it was', () => {
    expect(withNotif(undefined, n(1))).toEqual([n(1)])
    expect(withNotif([n(1)], n(2))).toEqual([n(1), n(2)])
  })

  it('is kept to its newest, whatever order they were kept in', () => {
    const full = Array.from({ length: NOTIFS_KEPT }, (_, i) => n(NOTIFS_KEPT - i))
    const next = withNotif(full, n(1000))
    expect(next).toHaveLength(NOTIFS_KEPT)
    expect(next[next.length - 1]).toEqual(n(1000))
    // The oldest went.
    expect(next.some((x) => x.ts === 1)).toBe(false)
  })

  it('is cut to its newest, however long it grew', () => {
    const grown = Array.from({ length: 5000 }, (_, i) => n(i))
    const kept = newestNotifs(grown)
    expect(kept).toHaveLength(NOTIFS_KEPT)
    expect(kept[0].ts).toBe(5000 - NOTIFS_KEPT)
    expect(newestNotifs([n(1)])).toEqual([n(1)])
  })
})
