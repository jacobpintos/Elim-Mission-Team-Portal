import { describe, it, expect } from 'vitest'
import { signedInTabsMounted } from './tabsMounted'

const tabs = { index: 0, routes: [{ name: 'dashboard' }, { name: 'issues' }] }
const root = (...routes: { name: string; state?: unknown }[]) => ({
  routes: [{ name: '__root', state: { index: routes.length - 1, routes } }],
})

describe('signedInTabsMounted', () => {
  it('is false before there is any state', () => {
    expect(signedInTabsMounted(undefined)).toBe(false)
  })

  it('is false at the start screen and on the sign-in screens', () => {
    expect(signedInTabsMounted(root({ name: 'index' }) as never)).toBe(false)
    expect(
      signedInTabsMounted(root({ name: '(auth)', state: { routes: [{ name: 'login' }] } }) as never)
    ).toBe(false)
  })

  it('is false once sent into the app but before its tabs exist', () => {
    expect(signedInTabsMounted(root({ name: '(app)' }) as never)).toBe(false)
  })

  it('is true once the tabs hold their own state', () => {
    expect(signedInTabsMounted(root({ name: '(app)', state: tabs }) as never)).toBe(true)
  })

  it('looks at the (app) on screen, not one under it', () => {
    expect(
      signedInTabsMounted(root({ name: '(app)', state: tabs }, { name: '(app)' }) as never)
    ).toBe(false)
  })
})
