import { describe, it, expect } from 'vitest'
import { sameId } from './ids'

describe('sameId', () => {
  it('matches across the string/number split', () => {
    // Firestore documents carry ids as both, which is the whole reason this
    // helper exists rather than ===.
    expect(sameId(7, '7')).toBe(true)
    expect(sameId('7', 7)).toBe(true)
  })

  it('still distinguishes different ids', () => {
    expect(sameId('7', '8')).toBe(false)
    expect(sameId(7, 70)).toBe(false)
  })

  it('does not treat null and undefined as the same id', () => {
    // Both stringify to distinct values, so a missing id must not collide
    // with a different missing id and silently grant a match.
    expect(sameId(null, undefined)).toBe(false)
  })

  it('does not match a missing id against a real one', () => {
    expect(sameId(undefined, 'u1')).toBe(false)
    expect(sameId(null, 'u1')).toBe(false)
  })
})
