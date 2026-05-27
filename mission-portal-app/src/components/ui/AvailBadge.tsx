import { Text, XStack } from 'tamagui'
import { AVAIL_COLORS, AVAIL_LABELS } from '@/lib/availability'
import type { AvailResponse } from '@/types/events'

interface AvailBadgeProps {
  status?: AvailResponse['status'] | null
  size?: 'sm' | 'md'
}

export function AvailBadge({ status, size = 'md' }: AvailBadgeProps) {
  if (!status) return null
  const color = AVAIL_COLORS[status]
  const label = AVAIL_LABELS[status]
  const fontSize = size === 'sm' ? 10 : 12
  const px = size === 'sm' ? '$1' : '$2'
  const py = size === 'sm' ? 2 : 4

  return (
    <XStack
      backgroundColor={color}
      borderRadius={99}
      paddingHorizontal={px}
      paddingVertical={py}
      alignItems="center"
      alignSelf="flex-start"
    >
      <Text color="white" fontSize={fontSize} fontWeight="600">
        {label}
      </Text>
    </XStack>
  )
}
