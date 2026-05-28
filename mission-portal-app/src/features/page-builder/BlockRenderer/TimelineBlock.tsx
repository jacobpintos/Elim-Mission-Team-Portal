import { YStack, XStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import type { TimelineData } from '@/types/pages'

interface TimelineBlockProps {
  data: TimelineData
}

export function TimelineBlock({ data }: TimelineBlockProps) {
  const { theme } = useThemeStore()
  const entries = data.entries ?? []

  if (entries.length === 0) {
    return (
      <YStack padding="$4">
        <Text color="$gray10" fontSize="$3">
          No timeline entries
        </Text>
      </YStack>
    )
  }

  return (
    <YStack padding="$4" gap="$0">
      {entries.map((entry, index) => (
        <XStack key={index} gap="$3">
          {/* Left: year + line */}
          <YStack alignItems="center" width={60}>
            <XStack
              backgroundColor={theme.primary}
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$2" color="white" fontWeight="700">
                {entry.year}
              </Text>
            </XStack>
            {index < entries.length - 1 && (
              <YStack flex={1} width={2} backgroundColor="$borderColor" marginTop="$1" />
            )}
          </YStack>

          {/* Right: content */}
          <YStack flex={1} paddingBottom="$4" gap="$1">
            <Text fontSize="$4" fontWeight="700">
              {entry.title}
            </Text>
            <Text fontSize="$3" color="$gray10" lineHeight={20}>
              {entry.desc}
            </Text>
          </YStack>
        </XStack>
      ))}
    </YStack>
  )
}
