/**
 * Which upcoming events a digest email lists for its reader (./digest).
 *
 * Kept free of Firebase, apart from the digest itself: the app's tests
 * import it, and the app is type-checked without the functions' packages.
 */

import { EVERYONE } from './eventPrivate'

export interface EventDoc {
  title?: string
  date?: string
  location?: string
  startTime?: string
  isPublic?: boolean
  unpublished?: boolean
  /** Who may see it at all (./eventPrivate eventSeenBy). */
  seenBy?: string[]
}

/** How many upcoming events each digest lists. */
const EVENTS_LISTED = 10

/**
 * The events this person may see, as the app would show them: never a
 * draft, and a non-public one only to those on it (./eventPrivate eventSeenBy).
 */
export function digestEventsFor(
  events: EventDoc[],
  user: { uid: string; roles?: string[] }
): EventDoc[] {
  const isAdminUser = (user.roles ?? []).includes('admin')
  return events
    .filter((ev) => {
      if (ev.unpublished === true) return false
      if (isAdminUser) return true
      return Array.isArray(ev.seenBy)
        ? ev.seenBy.includes(EVERYONE) || ev.seenBy.includes(user.uid)
        : ev.isPublic === true
    })
    .slice(0, EVENTS_LISTED)
}
