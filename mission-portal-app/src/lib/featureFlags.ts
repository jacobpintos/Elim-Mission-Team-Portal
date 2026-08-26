/**
 * Feature flags for surfaces held back from the current build.
 *
 * Each one hides a section rather than removing it: the screens stay in the
 * repo and come back by flipping a single constant here.
 */

/**
 * Whether outbound email features are offered.
 *
 * Everything email-shaped in the app sends through Resend, and `MAIL_FROM` is
 * still pointed at a placeholder domain, so those sends fail. Offering a
 * "weekly digest" switch that quietly delivers nothing is exactly the kind of
 * non-functional feature Apple rejects under Guideline 2.1, so the switches
 * are hidden until a verified sending domain is configured.
 *
 * This covers digests and the per-notification Email column only. Changing
 * your account email and resetting a password go through Firebase Auth's own
 * mailer, not Resend — they work, and they stay.
 *
 * Push notifications are unaffected.
 */
export const EMAIL_FEATURES_ENABLED = false

/**
 * Which parts of the public-facing surface the app exposes.
 *
 * The Public Facing section — Posts, Connect, Giving, Our Story, Content,
 * Photos — along with the `public` profile type that exists to read it.
 *
 * This was off while those pages were still empty: several are PageBuilder
 * pages, and a reviewer signing in to screens reading "there is nothing here
 * right now" is what Guideline 2.1 rejects. It is on now that they have
 * content behind them.
 *
 * Turning it off again is still a one-line change, and remains the right move
 * if the pages are ever emptied: every branch that reads this flag keeps its
 * hidden behaviour, and nothing under `app/(app)/public/` is deleted.
 *
 * To hide the whole section again:   PUBLIC_SURFACE_ENABLED = false
 * To hide one tab on its own:        drop its key from VISIBLE_PUBLIC_TABS
 *
 * Tab keys are plain strings rather than the `Tab` union so that `roles.ts`,
 * which owns that union, can import from here without a circular reference.
 */
export const PUBLIC_SURFACE_ENABLED = true

/** Every tab that belongs to the public-facing surface. */
export const PUBLIC_FACING_TABS = ['posts', 'connect', 'giving', 'story', 'music'] as const

/**
 * The public-facing tabs currently reachable.
 *
 * `music` is the Content tab. It is the one page in the set that members reach
 * directly rather than through Public Facing, and it is already part of what
 * guests and interns see, so it stays visible even when the rest are hidden.
 */
export const VISIBLE_PUBLIC_TABS: readonly string[] = PUBLIC_SURFACE_ENABLED
  ? PUBLIC_FACING_TABS
  : ['music']

/**
 * Content's menu entry.
 *
 * Members get this whether the section is shown or hidden — as the one
 * survivor when it is hidden, and alongside Public Facing when it is not.
 */
export const PUBLIC_REPLACEMENT_TAB = 'music'

export function isPublicFacingTab(tab: string): boolean {
  return (PUBLIC_FACING_TABS as readonly string[]).includes(tab)
}

/** False for a public-facing tab that is currently hidden. */
export function isTabVisible(tab: string): boolean {
  return !isPublicFacingTab(tab) || VISIBLE_PUBLIC_TABS.includes(tab)
}
