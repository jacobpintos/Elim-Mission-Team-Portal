/**
 * A person's in-app notifications (notifs/{uid}), kept to the newest few.
 *
 * The list is one document, and was only ever added to. A document holds
 * at most a megabyte: once someone's list reached it, every notification
 * to them failed — the push with it, sent after the list was written — and
 * nobody was told, as a reimbursement's steps went unannounced. Only the
 * newest are ever shown (the dashboard's unread, newest first), so the rest
 * go.
 *
 * Kept free of Firebase: the app's tests import it.
 */

/** How many a person's list keeps. */
export const NOTIFS_KEPT = 150

/** The list with this added, kept to the newest `max`, oldest first. */
export function withNotif<T extends { ts?: unknown }>(
  items: unknown,
  entry: T,
  max = NOTIFS_KEPT
): T[] {
  return newestNotifs([...(Array.isArray(items) ? (items as T[]) : []), entry], max)
}

/** The newest `max` of a list, oldest first; the list as it is when it has no more. */
export function newestNotifs<T extends { ts?: unknown }>(items: T[], max = NOTIFS_KEPT): T[] {
  if (items.length <= max) return items
  const at = (n: T) => (typeof n?.ts === 'number' ? n.ts : 0)
  return [...items].sort((a, b) => at(a) - at(b)).slice(-max)
}
