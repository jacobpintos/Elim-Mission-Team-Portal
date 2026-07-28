import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import { markProgress, clearProgress } from './diagnostics'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(): Promise<{
  token: string
  platform: 'ios' | 'android' | 'web'
} | null> {
  if (Platform.OS === 'web') return null

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device')
    return null
  }

  // TEMPORARY DIAGNOSTIC CHECKPOINTS — see index.js / src/lib/diagnostics.ts.
  // This whole flow has been crashing natively (RCTFatal via TurboModule
  // invocation) right around permission request, with no catchable JS error
  // reaching the caller's .catch(). Breadcrumbing each step to AsyncStorage
  // so we know exactly which native call was in flight even if the crash
  // itself bypasses JS entirely.
  await markProgress('registerForPushNotifications: start')

  await markProgress('before Notifications.getPermissionsAsync()')
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  await markProgress(`after getPermissionsAsync(): ${existingStatus}`)

  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    await markProgress('before Notifications.requestPermissionsAsync()')
    const { status } = await Notifications.requestPermissionsAsync()
    await markProgress(`after requestPermissionsAsync(): ${status}`)
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    await clearProgress()
    return null
  }

  if (Platform.OS === 'android') {
    await markProgress('before setNotificationChannelAsync()')
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
    await markProgress('after setNotificationChannelAsync()')
  }

  // getExpoPushTokenAsync throws if it can't resolve a projectId. It normally
  // infers it from Constants, but pass it explicitly (matching the SDK 56 docs
  // example) so the token call never depends on manifest inference.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  await markProgress(`before getExpoPushTokenAsync() (projectId: ${projectId ?? 'MISSING'})`)
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
  await markProgress('after getExpoPushTokenAsync(): success')
  await clearProgress()

  return {
    token: tokenData.data,
    platform: Platform.OS as 'ios' | 'android',
  }
}

// Transient Firebase Functions error codes worth retrying — a cold-started or
// briefly-unreachable callable returns these, and the background token save
// runs seconds after launch when a hiccup is most likely.
const RETRYABLE_FN_CODES = [
  'functions/unavailable',
  'functions/internal',
  'functions/deadline-exceeded',
  'functions/aborted',
]

async function callWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const code = (err as { code?: string } | undefined)?.code
      const retryable = code ? RETRYABLE_FN_CODES.includes(code) : false
      if (!retryable || i === attempts - 1) break
      // Backoff: 1s, 2s — lets a cold-starting function come online.
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

export async function persistPushToken(
  _uid: string,
  token: string,
  platform: 'ios' | 'android' | 'web'
): Promise<void> {
  // Delegates to Cloud Function which writes to Firestore and subscribes to topics
  const registerPushToken = httpsCallable(functions, 'registerPushToken')
  await callWithRetry(() => registerPushToken({ token, platform }))
}

export async function clearPushToken(
  _uid: string,
  platform: 'ios' | 'android' | 'web'
): Promise<void> {
  const registerPushToken = httpsCallable(functions, 'registerPushToken')
  await registerPushToken({ token: null, platform })
}

export async function unsubscribeFromPushTopic(_topic: string): Promise<void> {
  // Expo push tokens don't use topics client-side — managed server-side via registerPushToken.
}

export function platformKey(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android')
}

// TEMPORARY DIAGNOSTIC MARKER — see index.js.
;(globalThis as any).__diag_notificationsLoaded = true
