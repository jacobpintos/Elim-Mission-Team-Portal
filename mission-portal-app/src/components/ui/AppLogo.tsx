import { Image, Platform } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { useThemeColors } from '@/theme/useThemeColors'

const LOGO_URL =
  'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/e27f680f-3426-4c63-8ea9-e87647a99e8c/TheWell-Elim-Logo-Black.png?format=300w'

const WIDTHS = { sm: 140, md: 220, lg: 300 }

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSlogan?: boolean
}

export function AppLogo({ size = 'md', showSlogan = true }: AppLogoProps) {
  const { mode } = useThemeStore()
  const colors = useThemeColors()
  const isDark = mode === 'dark'
  const width = WIDTHS[size]

  return (
    <YStack alignItems="center" gap="$2">
      {Platform.OS === 'web' ? (
        <img
          src={LOGO_URL}
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
          source={{ uri: LOGO_URL }}
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
