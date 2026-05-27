import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { openLocationInMaps } from '@/lib/location'
import { AvailBadge } from './AvailBadge'
import type { EventInstance, AvailResponse } from '@/types/events'

interface EventCardProps {
  event: EventInstance
  myAvail?: AvailResponse | null
  onDetail?: () => void
  onAvail?: () => void
  showHealth?: boolean
  mini?: boolean
}

export function EventCard({ event, myAvail, onDetail, onAvail, mini }: EventCardProps) {
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
        <YStack flex={1} gap="$1">
          <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={1}>
            {event.title}
          </Text>
          <Text color={colors.textMuted} fontSize="$3">
            {FD(event.date, { weekday: true })}
            {event.startTime ? ` · ${event.startTime}` : ''}
          </Text>
          {event.location ? (
            <Pressable onPress={() => openLocationInMaps(event.location!)}>
              <Text
                color={colors.primary}
                fontSize="$2"
                textDecorationLine="underline"
                numberOfLines={1}
              >
                {event.location}
              </Text>
            </Pressable>
          ) : null}
        </YStack>
        {myAvail ? <AvailBadge status={myAvail.status} size="sm" /> : null}
      </XStack>
      {!mini ? (
        <XStack gap="$2" marginTop="$1">
          {onDetail ? (
            <Pressable onPress={onDetail}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
                alignItems="center"
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  Details
                </Text>
              </XStack>
            </Pressable>
          ) : null}
          {onAvail ? (
            <Pressable onPress={onAvail}>
              <XStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
                alignItems="center"
              >
                <Text color={colors.primary} fontSize="$2" fontWeight="600">
                  {myAvail ? '✓ Change Avail' : '✓ Set Avail'}
                </Text>
              </XStack>
            </Pressable>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  )
}
