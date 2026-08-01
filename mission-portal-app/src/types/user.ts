export type Role = 'admin' | 'security' | 'regular' | 'intern' | 'worship' | 'guest' | 'public'

/** Default hours before departure that a flight reminder is sent. */
export const DEFAULT_FLIGHT_REMINDER_HOURS = 3

export interface NotificationPrefs {
  newAssignment: { push: boolean; email: boolean }
  newMessage: { push: boolean; email: boolean }
  eventReminder: { push: boolean; email: boolean }
  announcement: { push: boolean; email: boolean }
  issueAssigned: { push: boolean; email: boolean }
  weeklyDigest: boolean
  monthlyDigest: boolean
  // General-user
  eventJoin: { push: boolean; email: boolean }
  eventRemoved: { push: boolean; email: boolean }
  worshipSetAssigned: { push: boolean; email: boolean }
  taskDueSoon: { push: boolean; email: boolean }
  // Admin-only
  rsvpNonAvailable: { push: boolean; email: boolean }
  kaizenSubmission: { push: boolean; email: boolean }
  issueSubmission: { push: boolean; email: boolean }
  eventHealthBehind: { push: boolean; email: boolean }
  chatFlagged: { push: boolean; email: boolean }
  securityReport: { push: boolean; email: boolean }
  weatherAlertAdmin: { push: boolean; email: boolean }
  /** A flight, hotel, carpool seat or food item was assigned to you. */
  eventLogistics: { push: boolean; email: boolean }
  /** Reminder before a flight you are booked on. */
  flightReminder: { push: boolean; email: boolean }
  // Public-user specific
  publicAnnouncement: { push: boolean; email: boolean }
  publicEvent: { push: boolean; email: boolean }
  contentFeatured: { push: boolean; email: boolean }
}

export interface UserProfile {
  /**
   * Hours before departure to send a flight reminder. Unset means
   * DEFAULT_FLIGHT_REMINDER_HOURS.
   */
  flightReminderHours?: number
  uid: string
  email: string
  displayName: string
  photoURL?: string
  roles: Role[]
  onboardingComplete: boolean
  notificationPrefs: NotificationPrefs
  pushTokens: {
    ios?: { token: string; deviceId: string; lastSeen: number }
    android?: { token: string; deviceId: string; lastSeen: number }
    web?: { token: string; deviceId: string; lastSeen: number }
  }
  locationPref?: {
    city: string
    state: string
    radius: number // miles
    lat?: number
    lng?: number
  }
  lastLoginAt?: number
  /** UIDs this user has blocked — their messages are hidden from this user. */
  blockedUsers?: string[]
  /** Message IDs this user reported — hidden from them immediately. */
  reportedMessages?: string[]
  /** Version of the Terms of Use accepted at sign-up. */
  acceptedTermsVersion?: string
  acceptedTermsAt?: number
  createdAt: unknown // Firestore Timestamp
  updatedAt: unknown
}
