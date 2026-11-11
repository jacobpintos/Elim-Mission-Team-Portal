import { describe, it, expect } from 'vitest'
import { tokenAgrees, type TokenSource } from './tokenRoles'
import { rolesClaim, sameRoles } from '../../functions/src/rolesClaim'

/** A sign-in whose token says `first` until it has been made again `after` times. */
function signIn(first: unknown, later: unknown, after = 1) {
  let made = 0
  const asked: boolean[] = []
  const user: TokenSource = {
    async getIdTokenResult(force) {
      asked.push(!!force)
      if (force) made++
      const roles = made >= after ? later : first
      return { claims: roles === undefined ? {} : { roles } }
    },
  }
  return { user, asked }
}
const noWait = { sleep: async () => {} }

describe('roles in the sign-in token', () => {
  it('are kept as the record has them: each once, in order', () => {
    expect(rolesClaim(['worship', 'admin', 'worship', 7, ''])).toEqual(['admin', 'worship'])
    expect(rolesClaim(undefined)).toEqual([])
    expect(sameRoles(['regular', 'admin'], ['admin', 'regular'])).toBe(true)
    expect(sameRoles(['regular'], ['admin', 'regular'])).toBe(false)
    // A token with no claim says nothing, even of no roles.
    expect(sameRoles(undefined, [])).toBe(false)
  })
})

describe('the token, against the record', () => {
  it('agrees, and asks for nothing new', async () => {
    const { user, asked } = signIn(['regular'], ['admin'])
    expect(await tokenAgrees(user, ['regular'], noWait)).toBe('agrees')
    expect(asked).toEqual([false])
  })

  it('carries no roles: the rules read the record, and nothing is asked for', async () => {
    const { user, asked } = signIn(undefined, ['regular'])
    expect(await tokenAgrees(user, ['regular'], noWait)).toBe('none')
    expect(asked).toEqual([false])
  })

  it('is behind: a new one is asked for until it agrees', async () => {
    // The server puts the new roles in the token a moment after: the third one made has them.
    const { user, asked } = signIn(['regular'], ['admin', 'regular'], 3)
    expect(await tokenAgrees(user, ['regular', 'admin'], noWait)).toBe('refreshed')
    expect(asked).toEqual([false, true, true, true])
  })

  it('gives up after so many, and when a newer check has taken over', async () => {
    const { user } = signIn(['regular'], ['admin'], 99)
    expect(await tokenAgrees(user, ['admin'], { ...noWait, tries: 3 })).toBe('gave up')
    let current = true
    const second = signIn(['regular'], ['admin'], 99)
    const out = tokenAgrees(second.user, ['admin'], {
      sleep: async () => {
        current = false
      },
      isCurrent: () => current,
    })
    expect(await out).toBe('gave up')
    expect(second.asked).toEqual([false, true])
  })

  it('gives up, without throwing, with no signal', async () => {
    const user: TokenSource = {
      async getIdTokenResult() {
        throw new Error('auth/network-request-failed')
      },
    }
    expect(await tokenAgrees(user, ['regular'], noWait)).toBe('gave up')
  })
})
