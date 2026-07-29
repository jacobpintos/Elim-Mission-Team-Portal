import { useCallback } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'expo-router'

/**
 * A Back handler that always goes somewhere, without popping browser history.
 *
 * Two separate problems this avoids:
 *
 * 1. `router.back()` silently does nothing when there is no history to pop —
 *    a screen opened from a pasted URL, a deep link, or after a `replace()`.
 *    The button looks fine and simply never responds.
 *
 * 2. On web, popping history fires `popstate`, which re-runs layout effects
 *    inside the navigator while the navigation object identity is changing and
 *    can spin into "Maximum update depth exceeded" (React error #185). The same
 *    hazard is why `ScreenTitle` renders nothing on web. So on web we never pop
 *    — we navigate straight to the destination instead. In-app Back stays
 *    predictable; the browser's own Back button is unaffected.
 *
 * Pass the route this screen should return to.
 */
export function useBackTo(fallback: string) {
  const router = useRouter()
  return useCallback(() => {
    if (Platform.OS === 'web') {
      router.replace(fallback as never)
      return
    }
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace(fallback as never)
    }
  }, [router, fallback])
}
