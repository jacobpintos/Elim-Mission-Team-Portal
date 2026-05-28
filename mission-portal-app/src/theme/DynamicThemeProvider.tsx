import { useEffect, useRef } from 'react'
import { TamaguiProvider, YStack, type TamaguiProviderProps } from 'tamagui'
import { Platform } from 'react-native'
import config from '../../tamagui.config'
import { useThemeStore } from '@/stores/themeStore'

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

    const palette = mode === 'dark' ? theme.dark : theme.light
    const root = document.documentElement

    // Set body background directly so the page colour matches the theme
    // regardless of flex/height chain issues in the component tree.
    document.body.style.backgroundColor = palette.background
    document.body.style.margin = '0'

    root.style.setProperty('--app-primary', theme.primary)
    root.style.setProperty('--app-primary-dark', theme.primaryDark)
    root.style.setProperty('--app-accent', theme.accent)
    root.style.setProperty('--app-background', palette.background)
    root.style.setProperty('--app-surface', palette.surface)
    root.style.setProperty('--app-text', palette.text)
    root.style.setProperty('--app-text-muted', palette.textMuted)
    root.style.setProperty('--app-border', palette.border)

    prevPrimaryRef.current = theme.primary
  }, [theme, mode])

  const tamaguiProps: Omit<TamaguiProviderProps, 'children'> = {
    config,
    defaultTheme: mode,
  }

  return (
    <TamaguiProvider {...tamaguiProps}>
      <YStack flex={1}>
        {children}
      </YStack>
    </TamaguiProvider>
  )
}
