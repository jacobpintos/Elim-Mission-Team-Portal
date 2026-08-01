import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { SocialData } from '@/types/pages'
import { openExternalUrl } from '@/lib/externalUrl'

interface SocialBlockProps {
  data: SocialData
}

export function SocialBlock({ data }: SocialBlockProps) {
  const { theme } = useThemeStore()
  const links = data.links ?? []

  const handlePress = (url: string) => {
    openExternalUrl(url)
  }

  return (
    <YStack padding="$4" gap="$3">
      {data.heading ? (
        <Text fontSize="$5" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}

      <XStack flexWrap="wrap" gap="$3">
        {links.map((link, index) => (
          <Pressable key={index} onPress={() => handlePress(link.url)}>
            <XStack
              backgroundColor={theme.primary}
              borderRadius="$3"
              paddingHorizontal="$4"
              paddingVertical="$2"
              alignItems="center"
              gap="$2"
            >
              {link.icon ? (
                <Text
                  style={{ color: theme.onPrimaryOverride ?? autoTextColor(theme.primary) }}
                  fontSize="$4"
                >
                  {link.icon}
                </Text>
              ) : null}
              <Text
                fontWeight="600"
                fontSize="$3"
                style={{ color: theme.onPrimaryOverride ?? autoTextColor(theme.primary) }}
              >
                {link.label}
              </Text>
            </XStack>
          </Pressable>
        ))}
        {links.length === 0 && (
          <Text color="$gray10" fontSize="$3">
            No social links added
          </Text>
        )}
      </XStack>
    </YStack>
  )
}
