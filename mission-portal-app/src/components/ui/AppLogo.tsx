import { Image, Platform } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { useThemeColors } from '@/theme/useThemeColors'

// Bundled asset — never breaks due to external CDN changes.
// Metro returns a number (asset ID) on native and a URL string on web.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEFAULT_LOGO = require('../../../assets/logo-black.png')

const WIDTHS = { sm: 140, md: 220, lg: 300 }

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSlogan?: boolean
}

export function AppLogo({ size = 'md', showSlogan = true }: AppLogoProps) {
  const { mode, theme } = useThemeStore()
  const colors = useThemeColors()
  const isDark = mode === 'dark'
  const width = WIDTHS[size]

  return (
    <YStack alignItems="center" gap="$2">
      {Platform.OS === 'web' ? (
        <img
          src={theme.logoUrl ?? DEFAULT_LOGO}
          alt="The Well of Iowa – Elim"
          style={{
            width,
            height: 'auto',
            objectFit: 'contain',
            filter: isDark ? 'brightness(0) invert(1)' : 'none',
            display: 'block',
          }}
        />
      ) : (
        <Image
          source={theme.logoUrl ? { uri: theme.logoUrl } : DEFAULT_LOGO}
          style={{ width, height: Math.round(width * 0.38), resizeMode: 'contain' }}
          tintColor={isDark ? '#ffffff' : undefined}
        />
      )}
      {showSlogan ? (
        <Text
          color={colors.textMuted}
          fontSize="$3"
          fontStyle="italic"
          letterSpacing={0.5}
          textAlign="center"
        >
          Together for Jesus
        </Text>
      ) : null}
    </YStack>
  )
}
