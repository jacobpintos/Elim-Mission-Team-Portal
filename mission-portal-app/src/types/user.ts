export type Role = 'admin' | 'security' | 'regular' | 'merch' | 'worship' | 'public' | 'unverified'

export interface NotificationPrefs {
  newAssignment: { push: boolean; email: boolean }
  newMessage: { push: boolean; email: boolean }
  eventReminder: { push: boolean; email: boolean }
  announcement: { push: boolean; email: boolean }
  issueAssigned: { push: boolean; email: boolean }
  weeklyDigest: boolean
  monthlyDigest: boolean
}

export interface UserProfile {
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
  createdAt: unknown // Firestore Timestamp
  updatedAt: unknown
}
