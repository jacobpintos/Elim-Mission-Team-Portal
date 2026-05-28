import { useEffect, useRef } from 'react'
import { TamaguiProvider, YStack, type TamaguiProviderProps } from 'tamagui'
import { Platform } from 'react-native'
import config from '../../tamagui.config'
import { useThemeStore } from '@/stores/themeStore'
import { defaults } from '@/theme/defaults'

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

// Synchronously set the body background before React renders. Tamagui injects
// `body { background: var(--background) }` inside `@media(prefers-color-scheme:dark)`,
// which wins on the first paint when JS hasn't run yet. By overriding with !important
// at module-load time we guarantee the correct colour from frame 0.
if (typeof document !== 'undefined') {
  const bg = defaults.dark.background
  document.documentElement.style.setProperty('--background', bg)
  document.body.style.setProperty('background-color', bg, 'important')
  document.body.style.margin = '0'
}

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

    const root = document.documentElement

    // Use setProperty with 'important' so the body background beats Tamagui's
    // @media(prefers-color-scheme) rule that targets body { background: var(--background) }.
    document.body.style.setProperty('background-color', palette.background, 'important')
    document.body.style.margin = '0'
    root.style.setProperty('--background', palette.background)

    root.style.setProperty('--app-primary', theme.primary)
    root.style.setProperty('--app-primary-dark', theme.primaryDark)
    root.style.setProperty('--app-accent', theme.accent)
    root.style.setProperty('--app-background', palette.background)
    root.style.setProperty('--app-surface', palette.surface)
    root.style.setProperty('--app-text', palette.text)
    root.style.setProperty('--app-text-muted', palette.textMuted)
    root.style.setProperty('--app-border', palette.border)

    prevPrimaryRef.current = theme.primary
  }, [theme, mode, palette])

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
