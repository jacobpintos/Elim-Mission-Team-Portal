import type { NotificationPrefs } from '@/types/user'

/** The notifications a person can turn on and off in Settings, and their names there. */
export type NotifKey = keyof Pick<
  NotificationPrefs,
  | 'newAssignment'
  | 'newMessage'
  | 'eventReminder'
  | 'announcement'
  | 'issueAssigned'
  | 'eventJoin'
  | 'eventRemoved'
  | 'worshipSetAssigned'
  | 'taskDueSoon'
  | 'rsvpNonAvailable'
  | 'kaizenSubmission'
  | 'issueSubmission'
  | 'eventHealthBehind'
  | 'chatFlagged'
  | 'securityReport'
  | 'weatherAlertAdmin'
  | 'textingListSignup'
  | 'eventLogistics'
  | 'flightReminder'
  | 'foodSignupOpen'
  | 'foodSignupReminder'
  | 'livestream'
>

// Admin-only notification keys — hidden from the toggle list for non-admins,
// same treatment issueAssigned already got.
export const ADMIN_ONLY_NOTIF_KEYS: NotifKey[] = [
  'rsvpNonAvailable',
  'kaizenSubmission',
  'issueSubmission',
  'eventHealthBehind',
  'chatFlagged',
  'securityReport',
  'weatherAlertAdmin',
  'textingListSignup',
  // Travel, flight and food notifications are NOT admin-only: they go to
  // whoever was handed the hotel room, booked on the flight or asked to bring
  // a dish. Hidden here, the person actually receiving them could neither see
  // that they were off nor turn them back on.
  'livestream',
]

export const NOTIF_LABELS: Record<NotifKey, string> = {
  newAssignment: 'New assignment',
  newMessage: 'New message',
  eventReminder: 'Event reminder',
  announcement: 'Announcement',
  issueAssigned: 'Issue assigned',
  eventJoin: 'Added to an event',
  eventRemoved: 'Removed from an event/team',
  worshipSetAssigned: 'Worship set assigned',
  taskDueSoon: 'Task due soon',
  rsvpNonAvailable: 'RSVP: not available',
  kaizenSubmission: 'New Kaizen submission',
  issueSubmission: 'New issue submission',
  eventHealthBehind: 'Event falling behind',
  chatFlagged: 'Chat flagged',
  securityReport: 'Security report',
  weatherAlertAdmin: 'Weather alert',
  textingListSignup: 'Texting list sign-ups',
  eventLogistics: 'Travel details assigned',
  flightReminder: 'Flight reminder',
  foodSignupOpen: 'Food sign-up opened',
  foodSignupReminder: 'Food items still open',
  livestream: 'A service goes live',
}

export type PublicNotifKey = keyof Pick<
  NotificationPrefs,
  'publicAnnouncement' | 'publicEvent' | 'contentFeatured' | 'livestream'
>

export const PUBLIC_NOTIF_LABELS: Record<PublicNotifKey, string> = {
  publicAnnouncement: 'Public announcements',
  publicEvent: 'Nearby & virtual events',
  contentFeatured: 'New & featured content',
  livestream: 'A service goes live',
}

/**
 * What a toggle shows for a preference never written.
 *
 * The public rows default on; the member rows already default off. Stream
 * alerts have to read as off in both, because there an unset value means the
 * prompt has not been answered — and showing it on would promise a
 * notification that nothing is going to send.
 */
const PUSH_DEFAULT_OFF = new Set<string>(['livestream'])
export const pushDefaultFor = (key: string) => !PUSH_DEFAULT_OFF.has(key)
