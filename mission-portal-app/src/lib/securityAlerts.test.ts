import { describe, it, expect } from 'vitest'

/**
 * Mirrors of the delivery rules in functions/src/push/notifyCore.ts.
 *
 * functions/ is a separate TypeScript project with its own build and the app
 * test runner does not compile it, so these copies exist to pin the rules that
 * decide whether someone's phone breaks through their Focus at 2am. If the
 * function changes, these must change with it — same arrangement as
 * flightReminder.test.ts.
 */
type InterruptionLevel = 'passive' | 'active' | 'time-sensitive' | 'critical'

function isSecurityUser(roles: unknown): boolean {
  return Array.isArray(roles) && (roles.includes('security') || roles.includes('admin'))
}

function interruptionLevelFor(
  type: string,
  profile: { roles?: unknown; notificationPrefs?: Record<string, unknown> } | undefined
): InterruptionLevel | undefined {
  if (type !== 'securityReport') return undefined
  if (!profile || !isSecurityUser(profile.roles)) return undefined
  if (profile.notificationPrefs?.securityReportUrgent === false) return undefined
  return 'time-sensitive'
}

const security = { roles: ['security'] }
const adminUser = { roles: ['admin'] }
const regular = { roles: ['regular'] }

describe('isSecurityUser', () => {
  it('counts the security role', () => {
    expect(isSecurityUser(['security'])).toBe(true)
  })

  it('counts admins, who are the escalation path', () => {
    expect(isSecurityUser(['admin'])).toBe(true)
  })

  it('does not count anyone else', () => {
    for (const roles of [['regular'], ['worship'], ['guest'], ['intern'], []]) {
      expect(isSecurityUser(roles)).toBe(false)
    }
  })

  it('survives a profile with no roles at all', () => {
    // Older documents predate the field; treating undefined as an array would
    // throw inside a notification trigger and lose the notification entirely.
    expect(isSecurityUser(undefined)).toBe(false)
    expect(isSecurityUser(null)).toBe(false)
    expect(isSecurityUser('security')).toBe(false)
  })
})

describe('interruptionLevelFor', () => {
  it('elevates an incident report for someone who answers them', () => {
    expect(interruptionLevelFor('securityReport', security)).toBe('time-sensitive')
    expect(interruptionLevelFor('securityReport', adminUser)).toBe('time-sensitive')
  })

  it('leaves every other notification type alone', () => {
    // The whole point of the feature is that it is the only one. A second
    // type breaking through Focus gets the app muted in Settings, which
    // silences the incident reports too.
    for (const type of [
      'newMessage',
      'flightReminder',
      'eventHealthBehind',
      'taskDueSoon',
      'announcement',
      'weatherAlertAdmin',
      'chatFlagged',
    ]) {
      expect(interruptionLevelFor(type, security)).toBeUndefined()
    }
  })

  it('does not elevate for someone who does not answer reports', () => {
    // A regular member can be in the audience — they filed the report — but
    // waking them through Focus for the outcome is not the point.
    expect(interruptionLevelFor('securityReport', regular)).toBeUndefined()
  })

  it('is on when the preference has never been set', () => {
    // Opt-out, not opt-in: a responder who never opens Settings stays
    // reachable, which is the entire reason the feature exists.
    expect(interruptionLevelFor('securityReport', { roles: ['security'] })).toBe('time-sensitive')
    expect(
      interruptionLevelFor('securityReport', { roles: ['security'], notificationPrefs: {} })
    ).toBe('time-sensitive')
  })

  it('honours someone switching it off', () => {
    const off = { roles: ['security'], notificationPrefs: { securityReportUrgent: false } }

    expect(interruptionLevelFor('securityReport', off)).toBeUndefined()
  })

  it('only treats an explicit false as off', () => {
    // A missing or malformed value must not silently downgrade a responder.
    for (const value of [true, undefined, null, 0, 'false']) {
      const p = { roles: ['security'], notificationPrefs: { securityReportUrgent: value } }
      expect(interruptionLevelFor('securityReport', p)).toBe('time-sensitive')
    }
  })

  it('handles a missing profile', () => {
    expect(interruptionLevelFor('securityReport', undefined)).toBeUndefined()
  })

  it('never returns critical, which needs an entitlement we do not have', () => {
    // Sending critical without Apple's entitlement gets the value ignored, so
    // a stray one here would read as working while doing nothing.
    for (const profile of [security, adminUser, regular]) {
      expect(interruptionLevelFor('securityReport', profile)).not.toBe('critical')
    }
  })

  it('uses the hyphenated spelling the push service expects', () => {
    // expo-server-sdk takes 'time-sensitive'; the client-side
    // expo-notifications package spells the same value 'timeSensitive'. The
    // push service ignores an unknown value rather than rejecting it, so the
    // camel-case spelling would be silently dropped.
    expect(interruptionLevelFor('securityReport', security)).toBe('time-sensitive')
  })
})
