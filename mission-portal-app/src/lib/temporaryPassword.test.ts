import { describe, it, expect } from 'vitest'
import { showsPassword, temporaryPassword } from '../../functions/src/temporaryPassword'

describe('a temporary password', () => {
  it('is three groups of four, with nothing that reads as something else', () => {
    for (let i = 0; i < 200; i++) {
      expect(temporaryPassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){2}$/)
    }
  })

  it('is never the same twice', () => {
    const made = new Set(Array.from({ length: 500 }, temporaryPassword))
    expect(made.size).toBe(500)
  })

  it('is only made for an app that says it will show it', () => {
    expect(showsPassword({ uid: 'u1', shown: true })).toBe(true)
    // An app from before: it would tell the admin the old fixed password.
    expect(showsPassword({ uid: 'u1' })).toBe(false)
    expect(showsPassword({ uid: 'u1', shown: 'yes' })).toBe(false)
    expect(showsPassword(null)).toBe(false)
  })
})
