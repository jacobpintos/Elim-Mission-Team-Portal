import { Image, Platform } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { useThemeColors } from '@/theme/useThemeColors'

const WIDTHS = { sm: 100, md: 180, lg: 220 }
const localIcon = require('../../../assets/icon.png')

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSlogan?: boolean
}

export function AppLogo({ size = 'md', showSlogan = true }: AppLogoProps) {
  const { mode, theme } = useThemeStore()
  const colors = useThemeColors()
  const isDark = mode === 'dark'
  const width = WIDTHS[size]
  const logoUrl = theme.logoUrl

  return (
    <YStack alignItems="center" gap="$2">
      {logoUrl ? (
        Platform.OS === 'web' ? (
          <img
            src={logoUrl}
            alt="The Well of Iowa – Elim"
            style={{
              width,
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              ...(isDark ? {
                filter: 'invert(1) hue-rotate(180deg)',
                mixBlendMode: 'screen' as const,
              } : {}),
            }}
          />
        ) : (
          <Image
            source={{ uri: logoUrl }}
            style={{ width, height: Math.round(width * 0.38), resizeMode: 'contain' }}
            tintColor={isDark ? '#ffffff' : undefined}
          />
        )
      ) : (
        <Image
          source={localIcon}
          style={{
            width,
            height: width,
            resizeMode: 'contain',
            ...(Platform.OS === 'web' && isDark ? {
              filter: 'invert(1) hue-rotate(180deg)',
              mixBlendMode: 'screen' as const,
            } : {}),
          }}
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
