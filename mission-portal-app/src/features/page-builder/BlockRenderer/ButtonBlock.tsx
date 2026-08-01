import { Pressable } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { ButtonData } from '@/types/pages'
import { openExternalUrl } from '@/lib/externalUrl'

interface ButtonBlockProps {
  data: ButtonData
}

export function ButtonBlock({ data }: ButtonBlockProps) {
  const { theme } = useThemeStore()
  const align = data.align ?? 'center'
  const flexAlign = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

  const handlePress = () => {
    if (data.url) {
      openExternalUrl(data.url)
    }
  }

  return (
    <YStack padding="$4" alignItems={flexAlign}>
      <Pressable onPress={handlePress}>
        <YStack
          backgroundColor={theme.primary}
          borderRadius="$3"
          paddingHorizontal="$5"
          paddingVertical="$3"
        >
          <Text
            fontSize="$4"
            fontWeight="700"
            style={{ color: theme.onPrimaryOverride ?? autoTextColor(theme.primary) }}
          >
            {data.label ?? 'Button'}
          </Text>
        </YStack>
      </Pressable>
    </YStack>
  )
}
