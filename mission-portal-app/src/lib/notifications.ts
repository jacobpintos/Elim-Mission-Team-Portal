import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

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

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const tokenData = await Notifications.getExpoPushTokenAsync()
  return {
    token: tokenData.data,
    platform: Platform.OS as 'ios' | 'android',
  }
}

export async function persistPushToken(
  _uid: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  // Delegates to Cloud Function which writes to Firestore and subscribes to topics
  const registerPushToken = httpsCallable(functions, 'registerPushToken')
  await registerPushToken({ token, platform })
}

export async function clearPushToken(
  _uid: string,
  platform: 'ios' | 'android' | 'web',
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
