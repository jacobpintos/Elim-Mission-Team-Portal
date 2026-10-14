import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { isOverdue } from '@/lib/availability'
import { FD } from '@/lib/format'
import { sameId } from '@/lib/ids'
import type { Task } from '@/types/events'

/** A task's colour on the calendar; red once it is overdue. */
export const TASK_COLOR = '#e67e22'
export const OVERDUE_COLOR = '#e74c3c'

/** Their tasks still to do, by the day each is due: what the calendar shows of them. */
export function tasksDueBetween(tasks: readonly Task[], uid: string, from: string, to: string) {
  return tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        !!t.dueDate &&
        t.dueDate >= from &&
        t.dueDate <= to &&
        t.assignees.some((a) => sameId(a, uid))
    )
    .sort(
      (a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || a.title.localeCompare(b.title)
    )
}

/** How a task stands, as its row says it: "In progress", "Overdue", "Behind · projected Oct 20". */
export function taskStanding(t: Task): string {
  if (isOverdue(t)) return 'Overdue'
  if (t.status === 'behind')
    return t.projectedDate ? `Behind · projected ${FD(t.projectedDate)}` : 'Behind'
  if (t.status === 'in_progress') return 'In progress'
  return 'Not started'
}

/** Their tasks due on a day, each a tap to it on the Tasks tab. */
export function DayTasks({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const colors = useThemeColors()
  if (tasks.length === 0) return null
  return (
    <YStack gap="$2" marginTop="$3">
      <Text color={colors.text} fontWeight="700" fontSize="$3">
        Tasks due
      </Text>
      {tasks.map((t) => {
        const color = isOverdue(t) ? OVERDUE_COLOR : TASK_COLOR
        return (
          <Pressable key={String(t.id)} onPress={() => onOpen(t)}>
            <XStack
              backgroundColor={colors.surface}
              borderRadius="$2"
              padding="$2"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
              alignItems="center"
            >
              <YStack width={4} alignSelf="stretch" backgroundColor={color} borderRadius={2} />
              <YStack flex={1}>
                <Text color={colors.text} fontWeight="600" fontSize="$3">
                  {t.title}
                </Text>
                <Text color={isOverdue(t) ? OVERDUE_COLOR : colors.textMuted} fontSize="$2">
                  {taskStanding(t)}
                </Text>
              </YStack>
            </XStack>
          </Pressable>
        )
      })}
    </YStack>
  )
}
