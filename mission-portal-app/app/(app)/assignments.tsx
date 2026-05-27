import { useEffect, useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { TaskCard } from '@/components/ui/TaskCard'
import { isAdmin } from '@/lib/roles'
import { isOverdue } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { Task } from '@/types/events'

type FilterTab = 'all' | 'pending' | 'done' | 'behind' | 'overdue'

interface TaskGroupColors {
  text: string
  textMuted: string
}

interface TaskGroupProps {
  title: string
  tasks: Task[]
  color?: string
  collapsed?: boolean
  onToggle?: () => void
  colors: TaskGroupColors
  onComplete: (task: Task) => void
  getEventTitle: (task: Task) => string | undefined
}

function TaskGroup({
  title,
  tasks,
  color,
  collapsed,
  onToggle,
  colors,
  onComplete,
  getEventTitle,
}: TaskGroupProps) {
  if (tasks.length === 0) return null
  return (
    <YStack gap="$2">
      <Pressable onPress={onToggle}>
        <XStack justifyContent="space-between" alignItems="center" paddingVertical="$1">
          <Text color={color ?? colors.text} fontWeight="700" fontSize="$3">
            {title}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {tasks.length} {onToggle ? (collapsed ? '▸' : '▾') : ''}
          </Text>
        </XStack>
      </Pressable>
      {!collapsed
        ? tasks.map((t) => (
            <TaskCard
              key={String(t.id)}
              task={t}
              onComplete={() => onComplete(t)}
              eventTitle={getEventTitle(t)}
            />
          ))
        : null}
    </YStack>
  )
}

export default function Assignments() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

  const tasksStore = useTasksStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { instances, subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    subTasks()
    subEvents()
    return () => {
      unsubTasks()
      unsubEvents()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseTasks = admin ? tasksStore.tasks : tasksStore.myTasks(uid)

  const filtered = baseTasks.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'done') return t.status === 'done'
    if (filter === 'behind') return t.status === 'behind'
    if (filter === 'overdue') return isOverdue(t)
    return true
  })

  const overdue = filtered.filter((t) => isOverdue(t))
  const behind = filtered.filter((t) => t.status === 'behind' && !isOverdue(t))
  const today = new Date().toISOString().split('T')[0]
  const in7 = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })()
  const upcoming = filtered.filter(
    (t) =>
      t.status === 'pending' &&
      !isOverdue(t) &&
      t.dueDate != null &&
      t.dueDate >= today &&
      t.dueDate <= in7
  )
  const allPending = filtered.filter(
    (t) =>
      t.status === 'pending' &&
      !isOverdue(t) &&
      !(t.dueDate && t.dueDate >= today && t.dueDate <= in7)
  )
  const done = filtered.filter((t) => t.status === 'done')

  const handleComplete = async (task: Task) => {
    try {
      await tasksStore.completeTask(task.id)
      toast('Task completed!', 'success')
      // Notify task creator if different from current user
      if (task.by && !sameId(task.by, uid)) {
        const sendNotif = httpsCallable(functions, 'sendNotification')
        sendNotif({
          uid: String(task.by),
          type: 'taskComplete',
          data: { taskId: String(task.id), taskTitle: task.title },
        }).catch(() => {})
      }
    } catch {
      toast('Failed to complete task', 'error')
    }
  }

  const getEventTitle = (t: Task) => {
    if (!t.evId && !t.evTemplateId) return undefined
    const id = t.evId ?? t.evTemplateId
    const today2 = new Date().toISOString().split('T')[0]
    const in90 = (() => {
      const d = new Date()
      d.setDate(d.getDate() + 90)
      return d.toISOString().split('T')[0]
    })()
    const evs = instances(today2, in90)
    const ev = evs.find((e) => sameId(e.templateId, id))
    return ev?.title
  }

  const FILTER_TABS: FilterTab[] = ['all', 'pending', 'done', 'behind', 'overdue']

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Assignments' }} />

      {/* Search + filter */}
      <YStack padding="$3" gap="$2" borderBottomWidth={1} borderBottomColor={colors.border}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search tasks…"
          backgroundColor={colors.surface}
          color={colors.text}
          borderColor={colors.border}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$1">
            {FILTER_TABS.map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)}>
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  borderRadius={99}
                  backgroundColor={filter === f ? colors.primary : 'transparent'}
                  borderWidth={1}
                  borderColor={filter === f ? colors.primary : colors.border}
                >
                  <Text
                    color={filter === f ? 'white' : colors.text}
                    fontSize="$2"
                    fontWeight={filter === f ? '600' : '400'}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </XStack>
        </ScrollView>
      </YStack>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {filter === 'all' || filter === 'overdue' ? (
            <TaskGroup
              title={`⚠ Overdue (${overdue.length})`}
              tasks={overdue}
              color="#c0392b"
              colors={colors}
              onComplete={handleComplete}
              getEventTitle={getEventTitle}
            />
          ) : null}
          {filter === 'all' || filter === 'behind' ? (
            <TaskGroup
              title={`⏰ Behind (${behind.length})`}
              tasks={behind}
              color="#e67e22"
              colors={colors}
              onComplete={handleComplete}
              getEventTitle={getEventTitle}
            />
          ) : null}
          {filter === 'all' || filter === 'pending' ? (
            <TaskGroup
              title={`📅 Due This Week (${upcoming.length})`}
              tasks={upcoming}
              color="#2980b9"
              colors={colors}
              onComplete={handleComplete}
              getEventTitle={getEventTitle}
            />
          ) : null}
          {filter === 'all' || filter === 'pending' ? (
            <TaskGroup
              title={`Pending (${allPending.length})`}
              tasks={allPending}
              colors={colors}
              onComplete={handleComplete}
              getEventTitle={getEventTitle}
            />
          ) : null}
          {filter === 'all' || filter === 'done' ? (
            <TaskGroup
              title={`✓ Done (${done.length})`}
              tasks={done}
              color="#27ae60"
              collapsed={filter === 'all' && !showDone}
              onToggle={filter === 'all' ? () => setShowDone((v) => !v) : undefined}
              colors={colors}
              onComplete={handleComplete}
              getEventTitle={getEventTitle}
            />
          ) : null}
          {filtered.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$4"
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text color={colors.textMuted}>No tasks found.</Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
