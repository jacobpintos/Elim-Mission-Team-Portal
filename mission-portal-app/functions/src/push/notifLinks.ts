/**
 * Where a notification takes you: the event, message, task, idea or issue
 * it's about — kept on the in-app entry (notifs/{uid}) and sent with the push,
 * so a tap on either opens it (app: dashboard's list, lib/notificationLink).
 *
 * A link the sender gave is used as it is. Otherwise it is worked out from
 * what the notification carries — an event's key, a task's id, an issue's —
 * and failing that, the screen its kind belongs to. An entry from before
 * links were kept has only its kind: the app asks `screenFor` for it.
 *
 * Kept free of Firebase: the app imports it.
 */

/** The screen each kind of notification belongs to, when it names nothing more. */
const SCREEN: Record<string, string> = {
  newAssignment: '/(app)/assignments',
  taskComplete: '/(app)/assignments',
  taskDueSoon: '/(app)/assignments',
  reminder: '/(app)/assignments',
  reimbursement: '/(app)/assignments',
  eventHealthBehind: '/(app)/events',
  newMessage: '/(app)/messages',
  chatFlagged: '/(app)/messages/moderation',
  announcement: '/(app)/announce',
  issueAssigned: '/(app)/issues/list',
  issueSubmission: '/(app)/issues/list',
  kaizenSubmission: '/(app)/issues/kaizen',
  kaizen_verification: '/(app)/issues/kaizen',
  event_update: '/(app)/events',
  eventReminder: '/(app)/events',
  eventRsvp: '/(app)/events',
  eventJoin: '/(app)/events',
  eventRemoved: '/(app)/events',
  rsvpNonAvailable: '/(app)/events',
  availabilityNudge: '/(app)/events',
  weatherAlertAdmin: '/(app)/events',
  eventLogistics: '/(app)/events',
  flightReminder: '/(app)/events',
  foodSignupOpen: '/(app)/events',
  foodSignupReminder: '/(app)/events',
  worshipSetAssigned: '/(app)/worship',
  securityReport: '/(app)/security',
  textingListSignup: '/(app)/admin/leadership',
  storeSale: '/(app)/store',
}

/** The screen a kind of notification belongs to; the dashboard for one it doesn't know. */
export function screenFor(type: string): string {
  return SCREEN[type] ?? '/(app)/dashboard'
}

/** A link inside the app: a path of its own, not another site's. */
export const isAppLink = (v: unknown): v is string =>
  typeof v === 'string' && /^\/(?!\/)/.test(v.trim()) && !/\s/.test(v.trim())

const said = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

/** Where a notification of this kind, carrying this, opens. */
export function notifLink(type: string, data: Record<string, unknown> = {}): string {
  if (isAppLink(data.link)) return data.link.trim()
  const id = (v: unknown) => encodeURIComponent(said(v))
  // An issue's own page, rather than the task made for it.
  if ((type === 'issueAssigned' || type === 'issueSubmission') && said(data.issueId)) {
    return `/(app)/issues/${id(data.issueId)}`
  }
  if (said(data.eventKey)) return `/(app)/events/${id(data.eventKey)}`
  if (said(data.taskId)) return `/(app)/assignments?taskId=${id(data.taskId)}`
  if (type === 'newMessage' && said(data.roomId)) return `/(app)/messages/${id(data.roomId)}`
  return screenFor(type)
}
