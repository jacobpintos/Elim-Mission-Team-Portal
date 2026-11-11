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
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { auth, db } from '@/lib/firebase'
import {
  registerForPushNotifications,
  persistPushToken,
  clearPushToken,
  platformKey,
} from '@/lib/notifications'
import { migrateRetiredRoles } from '@/lib/roles'
import { forgetOfflineData } from '@/lib/offlineCache'
import { defaultNotificationPrefs } from '@/types/user'
import { SIGN_UP_ENABLED } from '@/lib/featureFlags'
import { APP_URL } from '@/lib/orgInfo'
import { markStartup } from '@/lib/startupTimeline'
import { tokenAgrees } from '@/lib/tokenRoles'
import type { UserProfile } from '@/types/user'

interface AuthStore {
  fbUser: FBUser | null
  profile: UserProfile | null
  prevLoginAt: number | null
  loading: boolean
  /**
   * Counted up each time this sign-in's token is made again to carry roles
   * it was behind on (lib/tokenRoles). The stores that listen as whoever is
   * signed in (tasks, events, worship) listen again when it changes: what
   * they asked with the old token may have been refused.
   */
  tokenEpoch: number
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
  tokenEpoch: 0,
  _unsubAuth: null,
  _unsubProfile: null,

  init: () => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      get()._unsubProfile?.()
      markStartup(fbUser ? 'signedIn' : 'signedOut')
      if (!fbUser) {
        set({ fbUser: null, profile: null, loading: false, _unsubProfile: null })
        return
      }
      set({ fbUser, loading: true })
      let loginAtWritten = false
      // Which of this person's profile snapshots is the newest: only it is
      // shown, and only its check of the token goes on (below).
      let latest = 0
      const unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          const userProfile = snap.exists()
            ? ({ ...(snap.data() as UserProfile), uid: fbUser.uid } as UserProfile)
            : null
          markStartup('profile', snap.metadata.fromCache ? 'phone' : 'server')
          if (!snap.metadata.fromCache) markStartup('server')
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
          // 'merch' was retired as a user type. Rewriting the stored roles the
          // first time such a profile loads means no separate migration pass,
          // and an account that was merch-only stays a member rather than
          // dropping to public access.
          if (userProfile) {
            const migrated = migrateRetiredRoles(userProfile.roles)
            if (migrated) {
              userProfile.roles = migrated
              updateDoc(doc(db, 'users', fbUser.uid), { roles: migrated }).catch(() => {})
            }
          }
          // Their roles as their record has them, shown once their token
          // carries them too: the rules read roles from the token
          // (lib/tokenRoles). Nearly always it does already, or carries none
          // (the rules then read the record), and this is a moment's check.
          // When it is behind — their roles just changed — a new token is
          // asked for first, so what they are shown and what they may do
          // change together.
          //
          // Read from the phone's copy (no signal, or the server not yet
          // heard from): shown at once, as before, and checked after.
          const seq = ++latest
          const isCurrent = () => seq === latest
          const bumped = () => ({ tokenEpoch: get().tokenEpoch + 1 })
          if (!userProfile || snap.metadata.fromCache) {
            set({ profile: userProfile, loading: false })
            if (userProfile) {
              tokenAgrees(fbUser, userProfile.roles, { isCurrent }).then((how) => {
                if (how === 'refreshed' && isCurrent()) set(bumped())
              })
            }
            return
          }
          tokenAgrees(fbUser, userProfile.roles, { isCurrent }).then((how) => {
            if (!isCurrent()) return
            set({ profile: userProfile, loading: false, ...(how === 'refreshed' ? bumped() : {}) })
          })
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
    // Accounts are made by admins while sign-up is off (featureFlags), and
    // firestore.rules would refuse the record this goes on to write.
    if (!SIGN_UP_ENABLED) throw new Error('Accounts are made by an admin.')
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
      url: APP_URL,
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
    // The next person to sign in on this device sees none of what was kept.
    await forgetOfflineData()
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email.trim())
  },

  resendVerification: async () => {
    if (auth.currentUser)
      await sendEmailVerification(auth.currentUser, {
        url: APP_URL,
        handleCodeInApp: false,
      })
  },
}))
