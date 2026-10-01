import { clearIndexedDbPersistence, terminate } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * The web app's offline copy is Firestore's own cache (firebase.ts), so there
 * is nothing to load or save here — see offlineCache.ts for native.
 */

export async function loadOffline<T>(_key: string): Promise<T | null> {
  return null
}

export function saveOffline(_key: string, _value: unknown): void {}

/**
 * On signing out: wipe Firestore's copy on this device, so the next person to
 * sign in on it sees none of it.
 *
 * Firestore can only clear a cache it is not using, and cannot be used again
 * once stopped, so the page reloads onto the sign-in screen with a fresh one.
 * Where another tab still holds the cache it cannot be cleared; it is left,
 * and the reload still happens.
 */
export async function forgetOfflineData(): Promise<void> {
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch {
    // Another tab has it open.
  }
  window.location.replace('/')
}
