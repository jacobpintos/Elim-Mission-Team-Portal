import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * A copy on the device of what the app needs to open with no signal: who is
 * signed in, the chord sheets and the set lists.
 *
 * The web app has this from Firestore itself (its cache is kept in IndexedDB —
 * see firebase.ts), so offlineCache.web.ts does nothing but forget it. React
 * Native has no IndexedDB for Firestore to use, so the stores here put the
 * last copy they were sent from the server into AsyncStorage and start from
 * it until the live one arrives.
 *
 * Everything fails soft: a copy that cannot be written or read is the app as
 * it was before this existed, so nothing in here is worth showing anybody.
 */

const PREFIX = 'offline:'

export async function loadOffline<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveOffline(key: string, value: unknown): void {
  try {
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {})
  } catch {
    // A value that will not serialise is a copy not kept.
  }
}

/** On signing out: the next person to sign in on this phone sees none of it. */
export async function forgetOfflineData(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX))
    if (keys.length > 0) await AsyncStorage.multiRemove(keys)
  } catch {
    // Nothing more to do.
  }
}
