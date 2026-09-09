import { describe, it, expect } from 'vitest'
import {
  hasAnsweredStreamNotifications,
  wantsStreamNotifications,
  shouldAskAboutStreamNotifications,
} from './streamNotify'
import type { NotificationPrefs } from '@/types/user'

const prefs = (livestream?: { push: boolean; email: boolean }) =>
  ({ livestream }) as Partial<NotificationPrefs>

describe('stream notification consent', () => {
  it('treats an account that has never been asked as unanswered', () => {
    expect(hasAnsweredStreamNotifications(prefs())).toBe(false)
    expect(shouldAskAboutStreamNotifications(prefs())).toBe(true)
    expect(wantsStreamNotifications(prefs())).toBe(false)
  })

  it('treats a missing prefs object as unanswered rather than throwing', () => {
    for (const p of [null, undefined, {}]) {
      expect(hasAnsweredStreamNotifications(p)).toBe(false)
      expect(shouldAskAboutStreamNotifications(p)).toBe(true)
      expect(wantsStreamNotifications(p)).toBe(false)
    }
  })

  it('records a yes and stops asking', () => {
    const p = prefs({ push: true, email: false })
    expect(hasAnsweredStreamNotifications(p)).toBe(true)
    expect(shouldAskAboutStreamNotifications(p)).toBe(false)
    expect(wantsStreamNotifications(p)).toBe(true)
  })

  it('records a no and stops asking', () => {
    // The distinction this file exists for: declined and never-asked both send
    // nothing, but only one of them should be put in front of the person again.
    const p = prefs({ push: false, email: false })
    expect(hasAnsweredStreamNotifications(p)).toBe(true)
    expect(shouldAskAboutStreamNotifications(p)).toBe(false)
    expect(wantsStreamNotifications(p)).toBe(false)
  })

  it('does not accept a non-boolean as an answer', () => {
    const p = { livestream: { push: 'yes', email: false } } as unknown as Partial<NotificationPrefs>
    expect(hasAnsweredStreamNotifications(p)).toBe(false)
    expect(wantsStreamNotifications(p)).toBe(false)
  })
})
