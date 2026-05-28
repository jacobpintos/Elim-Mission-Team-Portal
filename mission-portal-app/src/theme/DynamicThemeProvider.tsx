import { useEffect, useRef } from 'react'
import { TamaguiProvider, YStack, type TamaguiProviderProps } from 'tamagui'
import { Platform } from 'react-native'
import config from '../../tamagui.config'
import { useThemeStore } from '@/stores/themeStore'
import { defaults } from '@/theme/defaults'

// In SPA mode (`web.output: 'single'`) Expo ignores `app/+html.tsx`, so there is
// no way to set the <body> background in the served HTML. Paint it here at module
// load — the earliest point JS can run — to avoid a flash of the browser-default
// background before React mounts. `!important` beats Tamagui's runtime
// @media(prefers-color-scheme) body{background} rule.
if (typeof document !== 'undefined') {
  const bg = defaults.dark.background
  document.documentElement.style.setProperty('background-color', bg, 'important')
  document.body.style.setProperty('background-color', bg, 'important')
  document.body.style.margin = '0'
}

/**
 * DynamicThemeProvider
 *
 * Uses the standard Tamagui config for type-safe tokens and extends it with
 * runtime color injection:
 *
 * - Web: injects CSS custom properties onto <html> so that custom component
 *   tokens (`--primary`, `--accent`, etc.) are available globally. This gives
 *   live Firestore re-skinning within ~1 s without a full config swap.
 *
 * - Native: equivalent StyleSheet variable injection via a ViewStyle ref (phase 6
 *   can switch to the full Tamagui theme API with `@tamagui/animations-react-native`).
 *
 * Components MUST read custom tokens via `useThemeColors()` from
 * `@/theme/useThemeColors` rather than Tamagui theme tokens directly for
 * custom palette values (primary, surface, textMuted, etc.).
 */
export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, mode, subscribe, unsubscribe } = useThemeStore()
  const prevPrimaryRef = useRef<string | null>(null)
  const palette = mode === 'dark' ? theme.dark : theme.light

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [subscribe, unsubscribe])

  // Inject CSS custom properties for web (no-op on native)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (
      prevPrimaryRef.current === theme.primary &&
      mode === (prevPrimaryRef.current ? 'cached' : 'dark')
    )
      return

    const p = mode === 'dark' ? theme.dark : theme.light
    const root = document.documentElement

    root.style.setProperty('--app-primary', theme.primary)
    root.style.setProperty('--app-primary-dark', theme.primaryDark)
    root.style.setProperty('--app-accent', theme.accent)
    root.style.setProperty('--app-background', p.background)
    root.style.setProperty('--app-surface', p.surface)
    root.style.setProperty('--app-text', p.text)
    root.style.setProperty('--app-text-muted', p.textMuted)
    root.style.setProperty('--app-border', p.border)

    prevPrimaryRef.current = theme.primary
  }, [theme, mode])

  const tamaguiProps: Omit<TamaguiProviderProps, 'children'> = {
    config,
    defaultTheme: mode,
  }

  return (
    <TamaguiProvider {...tamaguiProps}>
      <YStack flex={1} backgroundColor={palette.background}>
        {children}
      </YStack>
    </TamaguiProvider>
  )
}
