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
 * The Public Facing section (Posts, Connect, Giving, Our Story, Content,
 * Photos) is hidden for App Store review. Several of those pages are
 * PageBuilder pages with no blocks authored yet, so a reviewer signing in
 * lands on screens reading "there is nothing here right now" — which Apple
 * rejects under Guideline 2.1, App Completeness.
 *
 * Content survives and is promoted into the main menu, in the slot the
 * "Public Facing" entry used to occupy.
 *
 * Nothing is deleted. Every screen and route under `app/(app)/public/` is
 * still in the repo; they are unreachable rather than gone, so restoring the
 * section is a one-line change here rather than a revert.
 *
 * To bring the whole section back:      PUBLIC_SURFACE_ENABLED = true
 * To bring one tab back on its own:     add its key to VISIBLE_PUBLIC_TABS
 *
 * Tab keys are plain strings rather than the `Tab` union so that `roles.ts`,
 * which owns that union, can import from here without a circular reference.
 */
export const PUBLIC_SURFACE_ENABLED = false

/** Every tab that belongs to the public-facing surface. */
export const PUBLIC_FACING_TABS = ['posts', 'connect', 'giving', 'story', 'music'] as const

/**
 * The public-facing tabs currently reachable.
 *
 * `music` is the Content tab. It is the one page in the set with real content
 * behind it, and it is also already part of what guests and interns see, so
 * it stays visible while the rest are hidden.
 */
export const VISIBLE_PUBLIC_TABS: readonly string[] = PUBLIC_SURFACE_ENABLED
  ? PUBLIC_FACING_TABS
  : ['music']

/** The menu entry that replaces "Public Facing" while the section is hidden. */
export const PUBLIC_REPLACEMENT_TAB = 'music'

export function isPublicFacingTab(tab: string): boolean {
  return (PUBLIC_FACING_TABS as readonly string[]).includes(tab)
}

/** False for a public-facing tab that is currently hidden. */
export function isTabVisible(tab: string): boolean {
  return !isPublicFacingTab(tab) || VISIBLE_PUBLIC_TABS.includes(tab)
}
