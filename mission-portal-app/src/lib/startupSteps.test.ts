import { describe, it, expect } from 'vitest'
import { describeRun, parseRuns, seconds } from './startupSteps'

describe('startup steps', () => {
  it('reads seconds to a tenth under ten, whole above', () => {
    expect(seconds(640)).toBe('0.6s')
    expect(seconds(9_940)).toBe('9.9s')
    expect(seconds(31_400)).toBe('31s')
  })

  it('lists the steps in the order they came, with where the profile came from', () => {
    expect(
      describeRun({
        startedAt: 1,
        fromLaunch: true,
        steps: { server: 31_400, code: 620, firstScreen: 1_510, signedIn: 1_200, profile: 1_330 },
        profileFrom: 'phone',
      })
    ).toBe('code 0.6s · signed in 1.2s · profile 1.3s (device) · first screen 1.5s · server 31s')
  })

  it('says when the sign-in check was cut short', () => {
    expect(
      describeRun({
        startedAt: 1,
        fromLaunch: true,
        steps: { page: 240, code: 900, checkCut: 4_950, signedIn: 4_960, profile: 5_100 },
        profileFrom: 'server',
      })
    ).toBe(
      'page 0.2s · code 0.9s · sign-in check cut short 5.0s · signed in 5.0s · profile 5.1s (server)'
    )
  })

  it('shows only the steps reached', () => {
    expect(describeRun({ startedAt: 1, fromLaunch: false, steps: { signedOut: 900 } })).toBe(
      'sign-in screen 0.9s'
    )
  })

  it('keeps only runs it can read', () => {
    expect(parseRuns(null)).toEqual([])
    expect(parseRuns('not json')).toEqual([])
    expect(parseRuns(JSON.stringify([{ startedAt: 5, steps: {} }, { nope: 1 }, null]))).toEqual([
      { startedAt: 5, steps: {} },
    ])
  })
})
