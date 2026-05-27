import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { shortTime } from '@/lib/format'
import type { Announcement } from '@/types/events'

interface AnnouncementCardProps {
  announcement: Announcement
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const colors = useThemeColors()

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$3"
      padding="$3"
      gap="$2"
      borderWidth={1}
      borderColor={colors.border}
    >
      <XStack justifyContent="space-between" alignItems="flex-start">
        <Text color={colors.text} fontWeight="700" fontSize="$3" flex={1}>
          {announcement.title}
        </Text>
        <Text color={colors.textMuted} fontSize="$2">
          {shortTime(announcement.ts)}
        </Text>
      </XStack>
      <Text color={colors.textMuted} fontSize="$3" numberOfLines={4}>
        {announcement.body}
      </Text>
      {announcement.isPublic ? (
        <XStack
          backgroundColor={colors.primary}
          borderRadius={99}
          paddingHorizontal="$2"
          paddingVertical={2}
          alignSelf="flex-start"
        >
          <Text color="white" fontSize={10} fontWeight="600">
            Public
          </Text>
        </XStack>
      ) : null}
    </YStack>
  )
}
