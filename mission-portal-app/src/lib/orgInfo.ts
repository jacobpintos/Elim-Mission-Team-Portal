/**
 * Organisation contact details shown in the Privacy Policy and Terms of Use.
 *
 * App Review checks that the policy a user can read from inside the app names a
 * real way to reach the operator, and Guideline 1.2 requires published contact
 * information for reports about user-generated content. Set these via EAS
 * environment variables (`eas.json` → `build.<profile>.env`) so the shipped
 * binary carries the live address.
 */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? ''

export const ORG_NAME = process.env.EXPO_PUBLIC_ORG_NAME ?? 'The Well of Iowa'

export const ORG_MAILING_ADDRESS = process.env.EXPO_PUBLIC_ORG_ADDRESS ?? ''

/** How quickly reports about objectionable content are acted on. */
export const MODERATION_SLA_HOURS = 24
