import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

/**
 * Render this screen in light mode, restoring the previous mode on exit.
 *
 * Used by the signed-out screens. The fallback logo is the app icon, which has
 * no alpha channel, so on a dark background it shows as a white square — worst
 * on iOS, where the CSS filters `AppLogo` uses to invert it on web do nothing.
 * A light background lets it sit flush instead.
 *
 * Only for the sign-in flow, deliberately not the Privacy Policy or Terms:
 * those are reachable from Settings while signed in, and flipping an already
 * dark-themed app to light and back to read them would be jarring.
 *
 * Set with setMode, in memory only — the choice kept on the device is
 * chooseMode's — so this cannot leave a user's preference altered.
 */
export function useLightModeScreen() {
  const setMode = useThemeStore((s) => s.setMode)

  useEffect(() => {
    const previous = useThemeStore.getState().mode
    setMode('light')
    return () => setMode(previous)
  }, [setMode])
}
