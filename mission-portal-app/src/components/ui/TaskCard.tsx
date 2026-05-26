import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { isOverdue } from '@/lib/availability'
import type { Task } from '@/types/events'

interface TaskCardProps {
  task: Task
  onComplete?: () => void
  onPress?: () => void
  eventTitle?: string
}

const STATUS_COLORS: Record<Task['status'], string> = {
  pending: '#2980b9',
  done: '#27ae60',
  behind: '#e67e22',
}

export function TaskCard({ task, onComplete, onPress, eventTitle }: TaskCardProps) {
  const colors = useThemeColors()
  const overdue = isOverdue(task)

  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={colors.surface}
        borderRadius="$3"
        padding="$3"
        gap="$2"
        borderWidth={1}
        borderColor={overdue ? '#c0392b' : colors.border}
        alignItems="center"
      >
        <YStack flex={1} gap="$1">
          <Text color={colors.text} fontWeight="600" fontSize="$3" numberOfLines={2}>
            {task.title}
          </Text>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            {task.dueDate ? (
              <Text color={overdue ? '#c0392b' : colors.textMuted} fontSize="$2">
                Due {FD(task.dueDate)}
              </Text>
            ) : null}
            {eventTitle ? (
              <Text color={colors.textMuted} fontSize="$2">
                · {eventTitle}
              </Text>
            ) : null}
            <XStack
              backgroundColor={overdue ? '#c0392b' : STATUS_COLORS[task.status]}
              borderRadius={99}
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text color="white" fontSize={10} fontWeight="600">
                {overdue ? 'Overdue' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
              </Text>
            </XStack>
          </XStack>
        </YStack>
        {onComplete && task.status !== 'done' ? (
          <Pressable onPress={onComplete}>
            <XStack
              width={32}
              height={32}
              borderRadius={16}
              borderWidth={2}
              borderColor={colors.primary}
              alignItems="center"
              justifyContent="center"
            >
              <Text color={colors.primary} fontSize="$3">
                ✓
              </Text>
            </XStack>
          </Pressable>
        ) : null}
      </XStack>
    </Pressable>
  )
}
