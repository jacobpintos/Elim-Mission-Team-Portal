import AsyncStorage from '@react-native-async-storage/async-storage'

// Bump this suffix if the tour changes substantially and should re-show once.
const VERSION = 'v2'
const key = (uid: string) => `tour_seen_${VERSION}_${uid}`

/**
 * Whether this user has already seen (or dismissed) the first-login tour on
 * this device. On any storage error we return `true` so we never nag a user
 * we can't track.
 */
export async function hasSeenTour(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(uid))) === '1'
  } catch {
    return true
  }
}

export async function setTourSeen(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(uid), '1')
  } catch {
    // best-effort; ignore
  }
}
