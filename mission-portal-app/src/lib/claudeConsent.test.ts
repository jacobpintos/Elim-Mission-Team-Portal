import { describe, expect, it } from 'vitest'
import { askBeforeClaude, CAN_ASK_CLAUDE, claudeAllowed } from '../../functions/src/miriam/consent'

describe('leave for Miriam to ask Claude', () => {
  it('is theirs once they allow it, until they take it back', () => {
    expect(claudeAllowed(undefined)).toBe(false)
    expect(claudeAllowed({})).toBe(false)
    expect(claudeAllowed({ claudeConsent: { allowed: true, at: 1 } })).toBe(true)
    expect(claudeAllowed({ claudeConsent: { allowed: false, at: 2 } })).toBe(false)
  })

  it('is asked for before anything is sent, by an app that can ask', () => {
    const app = ['link', CAN_ASK_CLAUDE]
    expect(askBeforeClaude(app, {})).toBe(true)
    expect(askBeforeClaude(app, { claudeConsent: { allowed: false, at: 2 } })).toBe(true)
    expect(askBeforeClaude(app, { claudeConsent: { allowed: true, at: 1 } })).toBe(false)
  })

  it('leaves an app built before it as it was', () => {
    expect(askBeforeClaude(['link'], {})).toBe(false)
    expect(askBeforeClaude(undefined, {})).toBe(false)
  })
})
