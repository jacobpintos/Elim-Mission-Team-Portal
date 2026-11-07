import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * Over-the-air updates (app.config.ts: updates; .github/workflows/eas-update.yml):
 * the app checks for one each time it opens and downloads it then, but would
 * use it only from the next time it's fully started, which on an iPhone can
 * be days away. So:
 *
 * - an update waiting to be used is started on when the app comes back after
 *   at least AWAY_MS in the background, when nothing is half done (back from
 *   copying something a minute ago, it isn't);
 * - while the app is in use, it looks again for one when brought to the
 *   front, at most every CHECK_EVERY_MS.
 *
 * Nothing in development builds or Expo Go, where updates are off.
 */

const AWAY_MS = 10 * 60 * 1000
const CHECK_EVERY_MS = 30 * 60 * 1000

export function useAppUpdates(): void {
  const { isUpdatePending } = Updates.useUpdates()
  const pending = useRef(false)
  useEffect(() => {
    pending.current = isUpdatePending
  }, [isUpdatePending])

  useEffect(() => {
    if (!Updates.isEnabled) return
    let awayAt = 0
    // The opening itself looked (checkAutomatically: ON_LOAD).
    let checkedAt = Date.now()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        awayAt = Date.now()
        return
      }
      if (state !== 'active') return
      const away = awayAt ? Date.now() - awayAt : 0
      awayAt = 0
      if (pending.current && away >= AWAY_MS) {
        Updates.reloadAsync().catch(() => {})
        return
      }
      if (Date.now() - checkedAt >= CHECK_EVERY_MS) {
        checkedAt = Date.now()
        Updates.checkForUpdateAsync()
          .then((found) => (found.isAvailable ? Updates.fetchUpdateAsync() : null))
          .catch(() => {})
      }
    })
    return () => sub.remove()
  }, [])
}
