import { describe, it, expect, vi } from 'vitest'

// moderation.ts reaches Firestore at import time for the block/report writers.
// partitionHiddenMessages itself is pure, so stub the module out rather than
// stand up an emulator to test a filter.
vi.mock('@/lib/firebase', () => ({ db: {}, functions: {} }))

const { partitionHiddenMessages } = await import('@/lib/moderation')

interface Msg {
  uid: string | number
  ts: number
  text: string
}

const msg = (uid: string | number, ts: number, text = 't'): Msg => ({ uid, ts, text })

describe('partitionHiddenMessages', () => {
  it('returns everything when nothing is blocked or reported', () => {
    const messages = [msg('a', 1), msg('b', 2)]
    const result = partitionHiddenMessages(messages, undefined, undefined)

    expect(result.visible).toEqual(messages)
    expect(result.blockedCount).toBe(0)
    expect(result.reportedCount).toBe(0)
  })

  it('hides every message from a blocked author', () => {
    const result = partitionHiddenMessages([msg('a', 1), msg('b', 2), msg('a', 3)], ['a'], [])

    expect(result.visible).toEqual([msg('b', 2)])
    expect(result.blockedCount).toBe(2)
  })

  it('hides only the reported message, not the rest from that author', () => {
    const result = partitionHiddenMessages([msg('a', 1), msg('a', 2)], [], ['1_a'])

    expect(result.visible).toEqual([msg('a', 2)])
    expect(result.reportedCount).toBe(1)
    // The author was not blocked, so nothing should be attributed to blocking.
    expect(result.blockedCount).toBe(0)
  })

  it('counts a blocked author as blocked even when the message was also reported', () => {
    // The two counts drive different wording in the UI, so a message that
    // qualifies for both must not be counted twice or land in the wrong bucket.
    const result = partitionHiddenMessages([msg('a', 1)], ['a'], ['1_a'])

    expect(result.visible).toEqual([])
    expect(result.blockedCount).toBe(1)
    expect(result.reportedCount).toBe(0)
  })

  it('matches blocked ids across the string/number split', () => {
    // uid arrives as a number from some documents and a string from others.
    const result = partitionHiddenMessages([msg(7, 1), msg('7', 2)], ['7'], [])

    expect(result.visible).toEqual([])
    expect(result.blockedCount).toBe(2)
  })

  it('preserves message order among what stays visible', () => {
    const result = partitionHiddenMessages(
      [msg('a', 1), msg('b', 2), msg('c', 3), msg('b', 4)],
      ['b'],
      []
    )

    expect(result.visible.map((m) => m.ts)).toEqual([1, 3])
  })

  it('leaves an unrelated reported id alone', () => {
    const messages = [msg('a', 1)]
    const result = partitionHiddenMessages(messages, [], ['999_zz'])

    expect(result.visible).toEqual(messages)
    expect(result.reportedCount).toBe(0)
  })
})
