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
  signUp: (email: string, password: string, displayName: string) => Promise<void>
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
      const unsubProfile = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        const userProfile = (snap.data() as UserProfile) ?? null
        if (!loginAtWritten && userProfile) {
          loginAtWritten = true
          set({ prevLoginAt: userProfile.lastLoginAt ?? null })
          updateDoc(doc(db, 'users', fbUser.uid), { lastLoginAt: Date.now() }).catch(() => {})
          registerForPushNotifications()
            .then((result) => {
              if (result) return persistPushToken(fbUser.uid, result.token, result.platform)
            })
            .catch(() => {})
        }
        set({ profile: userProfile, loading: false })
      })
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

  signUp: async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName,
      roles: ['unverified'],
      onboardingComplete: false,
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
  }
}
