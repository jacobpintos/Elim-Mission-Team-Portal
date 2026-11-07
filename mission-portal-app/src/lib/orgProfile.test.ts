import { describe, expect, it } from 'vitest'
import { ORG } from '@/custom'
import { ORG as SERVER_ORG, todayInOrg } from '../../functions/src/org'

describe('the organization', () => {
  it('is the same one to the app and to its functions', () => {
    expect(SERVER_ORG.id).toBe(ORG.id)
    expect(SERVER_ORG.name).toBe(ORG.name)
    expect(SERVER_ORG.fullName).toBe(ORG.profile.fullName)
    expect(SERVER_ORG.timeZone).toBe(ORG.profile.timeZone)
    expect(SERVER_ORG.mailingAddress).toBe(ORG.profile.mailingAddress)
  })

  it('keeps its own days: late evening in Iowa is still that day there', () => {
    // 03:30 UTC on the 15th is 22:30 (or 21:30) on the 14th in Iowa.
    expect(todayInOrg(new Date('2026-11-15T03:30:00Z'))).toBe('2026-11-14')
    expect(todayInOrg(new Date('2026-11-15T07:00:00Z'))).toBe('2026-11-15')
  })

  it('has a time zone and a home the app can use', () => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: ORG.profile.timeZone })).not.toThrow()
    const { lat, lng, state } = ORG.profile.home
    expect(Math.abs(lat)).toBeLessThanOrEqual(90)
    expect(Math.abs(lng)).toBeLessThanOrEqual(180)
    expect(state).toMatch(/^[A-Z]{2}$/)
  })
})
