import { useState } from 'react'
import { Modal, ScrollView, Pressable, View, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { isOverdue } from '@/lib/availability'
import { FD } from '@/lib/format'
import type { Task } from '@/types/events'

export interface EventKanbanProps {
  tasks: Task[]
  eventTitle: string
  visible: boolean
  onClose: () => void
  resolveUser?: (uid: string | number) => string
}

function byDateAsc(a: Task, b: Task): number {
  const da = a.dueDate ?? ''
  const db = b.dueDate ?? ''
  return da < db ? -1 : da > db ? 1 : 0
}

function byDateDesc(a: Task, b: Task): number {
  return -byDateAsc(a, b)
}

interface SubSectionProps {
  title: string
  tasks: Task[]
  borderColor: string
  bgColor: string
  resolveUser: (uid: string | number) => string
}

function SubSection({ title, tasks, borderColor, bgColor, resolveUser }: SubSectionProps) {
  if (tasks.length === 0) return null
  return (
    <YStack
      borderLeftWidth={3}
      borderLeftColor={borderColor}
      backgroundColor={bgColor}
      borderRadius="$2"
      padding="$2"
      gap="$1"
      marginTop="$2"
    >
      <XStack gap="$1" alignItems="center" marginBottom="$1">
        <Text color={borderColor} fontWeight="700" fontSize={11}>
          {title}
        </Text>
        <XStack
          backgroundColor={borderColor}
          borderRadius={99}
          paddingHorizontal={6}
          paddingVertical={1}
        >
          <Text color="white" fontSize={10} fontWeight="700">
            {tasks.length}
          </Text>
        </XStack>
      </XStack>
      {tasks.map((t) => (
        <TaskCard key={String(t.id)} task={t} resolveUser={resolveUser} />
      ))}
    </YStack>
  )
}

interface TaskCardProps {
  task: Task
  resolveUser: (uid: string | number) => string
}

function TaskCard({ task, resolveUser }: TaskCardProps) {
  const colors = useThemeColors()
  const assigneeStr = task.assignees.map(resolveUser).join(', ')

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$2"
      padding="$2"
      gap="$1"
      borderWidth={1}
      borderColor={colors.border}
    >
      <Text color={colors.text} fontWeight="600" fontSize={12} numberOfLines={2}>
        {task.title}
      </Text>
      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        {task.dueDate ? (
          <Text color={colors.textMuted} fontSize={11}>
            Due: {FD(task.dueDate)}
          </Text>
        ) : null}
        {task.status === 'behind' && task.projectedDate ? (
          <Text color="#e67e22" fontSize={11}>
            Projected: {FD(task.projectedDate)}
          </Text>
        ) : null}
      </XStack>
      {assigneeStr ? (
        <Text color={colors.textMuted} fontSize={11} numberOfLines={1}>
          {assigneeStr}
        </Text>
      ) : null}
    </YStack>
  )
}

interface KanbanColumnProps {
  title: string
  count: number
  headerColor: string
  children: React.ReactNode
  maxHeight: number
}

function KanbanColumn({ title, count, headerColor, children, maxHeight }: KanbanColumnProps) {
  const colors = useThemeColors()
  return (
    <YStack
      width={280}
      backgroundColor={colors.surface}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      overflow="hidden"
    >
      {/* Column header */}
      <XStack
        backgroundColor={headerColor + '22'}
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor={headerColor + '44'}
        alignItems="center"
        gap="$2"
      >
        <Text color={headerColor} fontWeight="700" fontSize={13} flex={1}>
          {title}
        </Text>
        <XStack
          backgroundColor={headerColor}
          borderRadius={99}
          paddingHorizontal={8}
          paddingVertical={2}
        >
          <Text color="white" fontSize={11} fontWeight="700">
            {count}
          </Text>
        </XStack>
      </XStack>
      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator>
        <YStack padding="$2" gap="$2">
          {children}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

export function EventKanban({
  tasks,
  eventTitle,
  visible,
  onClose,
  resolveUser,
}: EventKanbanProps) {
  const colors = useThemeColors()
  const { height } = useWindowDimensions()
  const [showAllDone, setShowAllDone] = useState(false)

  const resolve = resolveUser ?? ((uid: string | number) => String(uid))

  // Not Started column
  const pendingOverdue = tasks.filter((t) => t.status === 'pending' && isOverdue(t)).sort(byDateAsc)
  const pendingNormal = tasks.filter((t) => t.status === 'pending' && !isOverdue(t)).sort(byDateAsc)

  // In Progress column
  const inProgressOverdue = tasks
    .filter((t) => t.status === 'in_progress' && isOverdue(t))
    .sort(byDateAsc)
  const inProgressNormal = tasks
    .filter((t) => t.status === 'in_progress' && !isOverdue(t))
    .sort(byDateAsc)

  // Behind column
  const behindOverdue = tasks.filter((t) => t.status === 'behind' && isOverdue(t)).sort(byDateAsc)
  const behindNormal = tasks.filter((t) => t.status === 'behind' && !isOverdue(t)).sort(byDateAsc)

  // Completed column
  const done = tasks.filter((t) => t.status === 'done').sort(byDateDesc)

  const hasProblems =
    pendingOverdue.length > 0 ||
    inProgressOverdue.length > 0 ||
    behindOverdue.length > 0 ||
    behindNormal.length > 0

  const totalCount = tasks.length
  const colMaxHeight = height * 0.65

  const DONE_COLLAPSE_THRESHOLD = 20
  const visibleDone =
    done.length > DONE_COLLAPSE_THRESHOLD && !showAllDone
      ? done.slice(0, 0) // show none, just the toggle
      : done

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <YStack
          backgroundColor={colors.background}
          borderRadius="$4"
          width="100%"
          maxWidth={960}
          maxHeight={height * 0.9}
          overflow="hidden"
          borderWidth={1}
          borderColor={colors.border}
        >
          {/* Modal header */}
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
            alignItems="center"
            gap="$3"
          >
            <YStack flex={1} gap="$1">
              <Text color={colors.text} fontWeight="700" fontSize={16} numberOfLines={1}>
                {eventTitle}
              </Text>
              <XStack gap="$2" alignItems="center">
                <Text color={colors.textMuted} fontSize={12}>
                  {totalCount} task{totalCount !== 1 ? 's' : ''}
                </Text>
                <XStack
                  backgroundColor={hasProblems ? '#c0392b' : '#27ae60'}
                  borderRadius={99}
                  paddingHorizontal={10}
                  paddingVertical={2}
                >
                  <Text color="white" fontSize={11} fontWeight="700">
                    {hasProblems ? '⚠ Behind' : '✓ On Track'}
                  </Text>
                </XStack>
              </XStack>
            </YStack>
            <Pressable onPress={onClose} hitSlop={8}>
              <XStack
                width={28}
                height={28}
                borderRadius={14}
                backgroundColor={colors.surface}
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
                justifyContent="center"
              >
                <Text color={colors.text} fontSize={14} fontWeight="700">
                  ✕
                </Text>
              </XStack>
            </Pressable>
          </XStack>

          {/* Columns */}
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ padding: 12 }}>
            <XStack gap="$3" padding="$1" alignItems="flex-start">
              {/* Not Started */}
              <KanbanColumn
                title="Not Started"
                count={pendingNormal.length + pendingOverdue.length}
                headerColor="#7f8c8d"
                maxHeight={colMaxHeight}
              >
                {pendingNormal.map((t) => (
                  <TaskCard key={String(t.id)} task={t} resolveUser={resolve} />
                ))}
                <SubSection
                  title="⚠ Overdue"
                  tasks={pendingOverdue}
                  borderColor="#c0392b"
                  bgColor="#c0392b11"
                  resolveUser={resolve}
                />
              </KanbanColumn>

              {/* In Progress */}
              <KanbanColumn
                title="In Progress"
                count={inProgressNormal.length + inProgressOverdue.length}
                headerColor="#2980b9"
                maxHeight={colMaxHeight}
              >
                {inProgressNormal.map((t) => (
                  <TaskCard key={String(t.id)} task={t} resolveUser={resolve} />
                ))}
                <SubSection
                  title="⚠ Overdue"
                  tasks={inProgressOverdue}
                  borderColor="#c0392b"
                  bgColor="#c0392b11"
                  resolveUser={resolve}
                />
              </KanbanColumn>

              {/* Behind */}
              <KanbanColumn
                title="Behind"
                count={behindNormal.length + behindOverdue.length}
                headerColor="#e67e22"
                maxHeight={colMaxHeight}
              >
                <SubSection
                  title="⚠ Overdue & Behind"
                  tasks={behindOverdue}
                  borderColor="#c0392b"
                  bgColor="#c0392b11"
                  resolveUser={resolve}
                />
                <SubSection
                  title="Falling Behind"
                  tasks={behindNormal}
                  borderColor="#e67e22"
                  bgColor="#e67e2211"
                  resolveUser={resolve}
                />
              </KanbanColumn>

              {/* Completed */}
              <KanbanColumn
                title="Completed"
                count={done.length}
                headerColor="#27ae60"
                maxHeight={colMaxHeight}
              >
                {done.length > DONE_COLLAPSE_THRESHOLD && !showAllDone ? (
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$2"
                    padding="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    alignItems="center"
                    gap="$2"
                  >
                    <Text color={colors.textMuted} fontSize={12}>
                      {done.length} completed tasks
                    </Text>
                    <Pressable onPress={() => setShowAllDone(true)}>
                      <XStack
                        borderWidth={1}
                        borderColor="#27ae60"
                        borderRadius={99}
                        paddingHorizontal={12}
                        paddingVertical={4}
                      >
                        <Text color="#27ae60" fontSize={11} fontWeight="600">
                          Show all
                        </Text>
                      </XStack>
                    </Pressable>
                  </YStack>
                ) : (
                  visibleDone.map((t) => (
                    <TaskCard key={String(t.id)} task={t} resolveUser={resolve} />
                  ))
                )}
                {done.length > DONE_COLLAPSE_THRESHOLD && showAllDone ? (
                  <Pressable onPress={() => setShowAllDone(false)}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius={99}
                      paddingHorizontal={12}
                      paddingVertical={4}
                      alignSelf="center"
                      marginTop="$2"
                    >
                      <Text color={colors.textMuted} fontSize={11}>
                        Collapse
                      </Text>
                    </XStack>
                  </Pressable>
                ) : null}
              </KanbanColumn>
            </XStack>
          </ScrollView>
        </YStack>
      </View>
    </Modal>
  )
}
