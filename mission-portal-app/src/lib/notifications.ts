// PHASE 1 STUB. Phase 6 fills these in with expo-notifications.
import { Platform } from 'react-native'

export async function registerForPushNotifications(): Promise<{
  token: string
  platform: 'ios' | 'android' | 'web'
} | null> {
  // Phase 6: request permission, get token, return it
  console.warn('registerForPushNotifications stubbed — phase 6 will implement')
  return null
}

export async function persistPushToken(
  _uid: string,
  _token: string,
  _platform: 'ios' | 'android' | 'web'
): Promise<void> {
  // Phase 6: write to users/{uid}/pushTokens
}

export async function unsubscribeFromPushTopic(_topic: string): Promise<void> {
  // Phase 6
}

export function platformKey(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android')
}
