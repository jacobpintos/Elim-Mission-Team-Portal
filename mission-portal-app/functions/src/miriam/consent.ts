/**
 * Leave for Miriam to send a request on to Claude, Anthropic's AI, when she
 * can't answer it herself — asked the first time one needs it, before
 * anything is sent (askMiriam), and kept on their account
 * (users/{uid}.claudeConsent); changed in Profile & Settings.
 *
 * Pure, and shared with the app (src/lib/claudeConsent).
 */

/** The ask, as the change Miriam shows to confirm (src/features/miriam/actions). */
export const ALLOW_CLAUDE = 'allow_claude'

/** What an app that can show the ask says it can (askMiriam `can`); one built before, not. */
export const CAN_ASK_CLAUDE = 'allowClaude'

export interface ClaudeConsent {
  allowed: boolean
  /** When they last said, by the clock. */
  at: number
}

/** Whether they have said yes — and not taken it back since. */
export const claudeAllowed = (user: { claudeConsent?: Partial<ClaudeConsent> } | undefined) =>
  user?.claudeConsent?.allowed === true

/**
 * Whether to ask before a request goes to Claude: not yet allowed, and asked
 * from an app that can show the ask (`can`, as it sent it). An app built
 * before then is answered as it was.
 */
export function askBeforeClaude(
  can: unknown,
  user: { claudeConsent?: Partial<ClaudeConsent> } | undefined
): boolean {
  return Array.isArray(can) && can.includes(CAN_ASK_CLAUDE) && !claudeAllowed(user)
}
