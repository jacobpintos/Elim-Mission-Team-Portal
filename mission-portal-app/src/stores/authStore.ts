import { create } from 'zustand'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  type User as FBUser,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import {
  registerForPushNotifications,
  persistPushToken,
  clearPushToken,
  platformKey,
} from '@/lib/notifications'
import type { UserProfile } from '@/types/user'

interface AuthStore {
  fbUser: FBUser | null
  profile: UserProfile | null
  prevLoginAt: number | null
  loading: boolean
  _unsubAuth: (() => void) | null
  _unsubProfile: (() => void) | null

  init: () => void
  teardown: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName: string,
    termsVersion: string
  ) => Promise<void>
  signOutNow: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  fbUser: null,
  profile: null,
  prevLoginAt: null,
  loading: true,
  _unsubAuth: null,
  _unsubProfile: null,

  init: () => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      get()._unsubProfile?.()
      if (!fbUser) {
        set({ fbUser: null, profile: null, loading: false, _unsubProfile: null })
        return
      }
      set({ fbUser, loading: true })
      let loginAtWritten = false
      const unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          const userProfile = snap.exists()
            ? ({ ...(snap.data() as UserProfile), uid: fbUser.uid } as UserProfile)
            : null
          if (!loginAtWritten && userProfile) {
            loginAtWritten = true
            set({ prevLoginAt: userProfile.lastLoginAt ?? null })
            updateDoc(doc(db, 'users', fbUser.uid), { lastLoginAt: Date.now() }).catch(() => {})
            // Defer push registration off the critical cold-start path. On a
            // restored session this callback fires within the first couple of
            // seconds of launch, before React has committed its first render.
            // Waiting lets the app render and settle first, and avoids
            // prompting for notification permission the instant the app opens.
            setTimeout(() => {
              registerForPushNotifications()
                .then((result) => {
                  if (result) return persistPushToken(fbUser.uid, result.token, result.platform)
                })
                .catch((err) => {
                  console.warn('Push notification registration failed', err)
                })
            }, 4000)
          }
          set({ profile: userProfile, loading: false })
        },
        () => {
          // Firestore read failed (e.g. permission denied) — unblock routing so the app
          // doesn't hang on a loading screen; profile stays null and routing handles it.
          set({ profile: null, loading: false })
        }
      )
      set({ _unsubProfile: unsubProfile })
    })
    set({ _unsubAuth: unsubAuth })
  },

  teardown: () => {
    get()._unsubAuth?.()
    get()._unsubProfile?.()
    set({ _unsubAuth: null, _unsubProfile: null })
  },

  signIn: async (email, password) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  },

  signUp: async (email, password, displayName, termsVersion) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName,
      roles: ['public'],
      onboardingComplete: true,
      // Recorded so we can prove acceptance of the UGC terms (Guideline 1.2).
      acceptedTermsVersion: termsVersion,
      acceptedTermsAt: Date.now(),
      blockedUsers: [],
      reportedMessages: [],
      notificationPrefs: defaultNotificationPrefs(),
      pushTokens: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    // Fire-and-forget — resend button on verify-email screen handles retries
    sendEmailVerification(cred.user, {
      url: process.env.EXPO_PUBLIC_APP_URL ?? 'https://mission-team-portal.web.app',
      handleCodeInApp: false,
    }).catch(() => {})
  },

  signOutNow: async () => {
    const { fbUser } = get()
    const key = platformKey()
    if (fbUser && key !== 'web') {
      await clearPushToken(fbUser.uid, key).catch(() => {})
    }
    await signOut(auth)
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email.trim())
  },

  resendVerification: async () => {
    if (auth.currentUser)
      await sendEmailVerification(auth.currentUser, {
        url: process.env.EXPO_PUBLIC_APP_URL ?? 'https://mission-team-portal.web.app',
        handleCodeInApp: false,
      })
  },
}))

function defaultNotificationPrefs() {
  return {
    newAssignment: { push: true, email: false },
    newMessage: { push: true, email: false },
    eventReminder: { push: true, email: true },
    announcement: { push: true, email: false },
    issueAssigned: { push: true, email: false },
    weeklyDigest: true,
    monthlyDigest: false,
    eventJoin: { push: true, email: false },
    eventRemoved: { push: true, email: false },
    worshipSetAssigned: { push: true, email: false },
    taskDueSoon: { push: true, email: false },
    rsvpNonAvailable: { push: true, email: false },
    kaizenSubmission: { push: true, email: false },
    issueSubmission: { push: true, email: false },
    eventHealthBehind: { push: true, email: false },
    chatFlagged: { push: true, email: false },
    securityReport: { push: true, email: false },
    weatherAlertAdmin: { push: true, email: false },
  }
}
