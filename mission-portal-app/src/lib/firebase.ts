import { initializeApp, getApps } from 'firebase/app'
import { getAuth, initializeAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import { Platform } from 'react-native'

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
}

// Avoid re-initializing on hot reload
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

// Native needs AsyncStorage persistence; web uses default (IndexedDB).
let _auth: ReturnType<typeof getAuth> | undefined

function getFirebaseAuth() {
  if (_auth) return _auth
  if (Platform.OS === 'web') {
    _auth = getAuth(app)
  } else {
    // getReactNativePersistence is only available via the React Native-specific
    // firebase/auth entry point. We use require() so that bundlers only include
    // this code path in native builds, keeping the web bundle clean.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: unknown) => unknown
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default
    _auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as never,
    })
  }
  return _auth!
}

export const auth = getFirebaseAuth()
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

// TEMPORARY DIAGNOSTIC MARKER — see index.js.
;(globalThis as any).__diag_firebaseLoaded = true
