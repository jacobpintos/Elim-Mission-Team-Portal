/**
 * The web half of takePendingNotificationLink.
 *
 * There are no notifications to have tapped, and asking expo-notifications for
 * the last response on web throws: its emitter is a stub carrying addListener
 * and nothing else, and getLastNotificationResponse raises UnavailabilityError.
 *
 * What there is instead is the address the app was opened at. A friend sent an
 * invitation (lib/invite) opens an event's page — /events/<key> — and, signed
 * out, is put at the sign-in screen, which then took them to their first tab:
 * the event they were invited to lost on the way. So an event's page opened
 * at is kept, read before any redirect could change the address, and given
 * here once they are signed in — as a tapped notification's link is on a phone.
 */
const OPENED_AT = (() => {
  if (typeof window === 'undefined') return null
  const path = window.location.pathname
  return /^\/events\/[^/]+$/.test(path)
    ? { link: path + window.location.search, at: Date.now() }
    : null
})()
/** Signing up and confirming an email can take a while; much longer, and it's another visit. */
const KEEP_MS = 30 * 60 * 1000
let taken = false

export function takePendingNotificationLink(): string | null {
  if (taken || !OPENED_AT || Date.now() - OPENED_AT.at > KEEP_MS) return null
  taken = true
  return OPENED_AT.link
}
