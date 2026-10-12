import { describe, expect, it } from 'vitest'
import { FORGET_MS, KEEP, recentExchanges, withExchange, type Exchange } from './miriamConversation'

const ex = (said: string, at: number, reply = `re ${said}`): Exchange => ({ said, reply, at })

describe('what Miriam remembers of a conversation', () => {
  it('keeps the last few, oldest first', () => {
    let list: Exchange[] = []
    for (let i = 0; i < KEEP + 2; i++) list = withExchange(list, ex(`q${i}`, i * 1000))
    expect(list.map((e) => e.said)).toEqual(Array.from({ length: KEEP }, (_, i) => `q${i + 2}`))
  })
  it('starts afresh after a quiet while', () => {
    const list = withExchange([ex('a', 0)], ex('b', FORGET_MS + 1))
    expect(list.map((e) => e.said)).toEqual(['b'])
    expect(recentExchanges([ex('a', 0)], FORGET_MS)).toEqual([])
    expect(recentExchanges([ex('a', 0)], 1000)).toEqual([{ said: 'a', reply: 're a' }])
  })
  it('keeps the same answer once', () => {
    const once = withExchange([], ex('a', 0))
    expect(withExchange(once, ex('a', 5))).toBe(once)
  })
})
