import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { shortTime } from '@/lib/format'
import type { InAppNotif } from '@/types/events'

interface NotificationRowProps {
  notif: InAppNotif
  onPress?: () => void
}

export function NotificationRow({ notif, onPress }: NotificationRowProps) {
  const colors = useThemeColors()

  return (
    <Pressable onPress={onPress}>
      <XStack
        gap="$2"
        paddingVertical="$2"
        paddingHorizontal="$3"
        alignItems="flex-start"
        opacity={notif.read ? 0.6 : 1}
      >
        <YStack
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={notif.read ? 'transparent' : colors.primary}
          marginTop={6}
        />
        <YStack flex={1} gap={2}>
          <Text color={colors.text} fontSize="$3">
            {notif.msg}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {shortTime(notif.ts)}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}
