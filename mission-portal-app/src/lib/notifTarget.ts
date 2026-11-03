import { isAppLink, screenFor } from '../../functions/src/push/notifLinks'
import type { InAppNotif } from '@/types/events'

/**
 * Where a notification in the app's list opens: the link it was given when
 * it was sent (functions/src/push/notifLinks), or — one from before links
 * were kept — the screen its kind belongs to.
 */
export function notifTarget(n: Pick<InAppNotif, 'type' | 'link'>): string {
  return isAppLink(n.link) ? n.link.trim() : screenFor(n.type)
}
