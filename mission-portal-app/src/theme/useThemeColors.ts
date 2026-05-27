import { useThemeStore } from '@/stores/themeStore'

/**
 * Returns the current dynamic palette colors from the Firestore-backed themeStore.
 * Use this instead of Tamagui theme tokens when you need custom app colors
 * (primary, accent, surface, textMuted, border).
 *
 * For standard Tamagui tokens ($background, $color, $borderColor) use
 * the Tamagui theme system directly.
 */
export function useThemeColors() {
  const { theme, mode } = useThemeStore()
  const palette = mode === 'dark' ? theme.dark : theme.light
  return {
    primary: theme.primary,
    primaryDark: theme.primaryDark,
    accent: theme.accent,
    background: palette.background,
    surface: palette.surface,
    text: palette.text,
    textMuted: palette.textMuted,
    border: palette.border,
    onPrimary: theme.onPrimaryOverride ?? (palette.text === '#ffffff' ? '#ffffff' : '#1a1a2e'),
  }
}
