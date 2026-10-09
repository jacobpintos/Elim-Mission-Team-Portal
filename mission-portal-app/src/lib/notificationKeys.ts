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
