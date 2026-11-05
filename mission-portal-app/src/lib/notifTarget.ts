import { isAppLink, screenFor } from '../../functions/src/push/notifLinks'
import type { InAppNotif } from '@/types/events'

/** The Events tab, as a notification that names no event of its own falls back to it. */
const EVENTS = '/(app)/events'

/**
 * Where a notification in the app's list opens: the link it was given when
 * it was sent (functions/src/push/notifLinks), or — one from before links
 * were kept — the screen its kind belongs to.
 *
 * One for the Events tab that names no event — sent before events' links
 * were kept, or by an app from before then: "You've been added to Revive
 * Me" — goes there with what it said, for the event named in it to be found
 * and opened (app/(app)/events: `about`; lib/eventNamed).
 */
export function notifTarget(n: Pick<InAppNotif, 'type' | 'link'> & { msg?: string }): string {
  const to = isAppLink(n.link) ? n.link.trim() : screenFor(n.type)
  return to === EVENTS ? eventsAbout(n.msg) : to
}

/** The Events tab, told what a notification said, to find the event it's about. */
export function eventsAbout(said: string | undefined | null): string {
  const text = (said ?? '').trim()
  return text ? `${EVENTS}?about=${encodeURIComponent(text)}` : EVENTS
}

/**
 * Where a tapped push opens: its link — or, one for the Events tab that
 * names no event, the Events tab told which, from the event's title it
 * carries or what it said.
 */
export function pushTarget(link: string, data: { eventTitle?: unknown }, body?: string): string {
  if (link.trim() !== EVENTS) return link
  const title = typeof data.eventTitle === 'string' ? data.eventTitle : ''
  return eventsAbout(title || body)
}
