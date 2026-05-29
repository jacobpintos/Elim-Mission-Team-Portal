import { useEffect, useState } from 'react'
import { ScrollView, Pressable, Modal, View, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useKaizenStore } from '@/stores/kaizenStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { TaskCard } from '@/components/ui/TaskCard'
import { EventKanban } from '@/features/events/EventKanban'
import { isAdmin } from '@/lib/roles'
import { isOverdue } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { Task } from '@/types/events'
import type { KaizenCard, KaizenVerificationResult } from '@/types/operations'

type EffectivenessKey = KaizenVerificationResult['effectiveness']

const EFFECTIVENESS_OPTIONS: { key: EffectivenessKey; label: string; color: string }[] = [
  { key: 'effective', label: 'Effective', color: '#27ae60' },
  { key: 'partially_effective', label: 'Partially Effective', color: '#e67e22' },
  { key: 'not_effective', label: 'Not Effective', color: '#c0392b' },
]

function CAVerificationModal({
  task,
  card,
  uid,
  onClose,
  onSubmit,
}: {
  task: Task | null
  card: KaizenCard | undefined
  uid: string
  onClose: () => void
  onSubmit: (result: Omit<KaizenVerificationResult, 'completedAt'>) => Promise<void>
}) {
  const colors = useThemeColors()
  const [effectiveness, setEffectiveness] = useState<EffectivenessKey>('effective')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!task) return null

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit({ effectiveness, notes, completedBy: uid })
      setNotes('')
      setEffectiveness('effective')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={!!task} animationType="slide" transparent onRequestClose={onClose}>
      <View style={caStyles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$5"
          gap="$3"
          width="90%"
          maxWidth={520}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700">CA Verification</Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>

          {card?.actionPlan ? (
            <YStack gap="$2">
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">CORRECTIVE ACTION</Text>
                <Text color={colors.text} fontSize="$3">{card.actionPlan.description}</Text>
              </YStack>
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">VERIFICATION METHOD</Text>
                <Text color={colors.text} fontSize="$3">{card.actionPlan.verificationMethod}</Text>
              </YStack>
            </YStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$3">{task.title}</Text>
          )}

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">EFFECTIVENESS</Text>
            <XStack gap="$2" flexWrap="wrap">
              {EFFECTIVENESS_OPTIONS.map((opt) => (
                <Pressable key={opt.key} onPress={() => setEffectiveness(opt.key)}>
                  <XStack
                    borderRadius={99}
                    paddingHorizontal="$3"
                    paddingVertical="$1"
                    backgroundColor={effectiveness === opt.key ? opt.color : 'transparent'}
                    borderWidth={1}
                    borderColor={opt.color}
                    marginBottom="$1"
                  >
                    <Text
                      color={effectiveness === opt.key ? 'white' : opt.color}
                      fontSize="$2"
                      fontWeight="600"
                    >
                      {opt.label}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>
          </YStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">NOTES</Text>
            <TextInput
              style={[caStyles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Observations, evidence, or additional notes…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />
          </YStack>

          <Pressable onPress={handleSubmit} disabled={submitting}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingVertical="$3"
              justifyContent="center"
              opacity={submitting ? 0.5 : 1}
            >
              <Text color="white" fontWeight="700" fontSize="$3">
                {submitting ? 'Submitting…' : 'Submit Verification'}
              </Text>
            </XStack>
          </Pressable>
        </YStack>
      </View>
    </Modal>
  )
}

const caStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
})

type FilterTab = 'all' | 'pending' | 'done' | 'behind' | 'overdue'
type AdminView = 'mine' | 'all' | 'health'

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
  resolveUser: (uid: string | number) => string
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
  resolveUser,
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
              assigneeNames={t.assignees.map(resolveUser)}
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
  const { templates, subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { users: allUsers } = useUsersStore()
  const { cards: kaizenCards, subscribe: subKaizen, unsubscribe: unsubKaizen, submitVerification } = useKaizenStore()
  const displayName = (uid: string | number): string => {
    const u = allUsers.find((x) => String(x.uid) === String(uid))
    return u?.displayName ?? String(uid)
  }
  const toast = useUIStore((s) => s.toast)

  const [adminView, setAdminView] = useState<AdminView>('mine')
  const [kanbanEvent, setKanbanEvent] = useState<{ title: string; tasks: Task[] } | null>(null)
  const [verifyTask, setVerifyTask] = useState<Task | null>(null)

  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    subTasks()
    subEvents()
    subKaizen()
    return () => {
      unsubTasks()
      unsubEvents()
      unsubKaizen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseTasks = adminView === 'all' ? tasksStore.tasks : tasksStore.myTasks(uid)

  const filtered = baseTasks.filter((t) => {
    if (search) {
      const q = search.toLowerCase()
      const titleMatch = t.title.toLowerCase().includes(q)
      const eventMatch = (getEventTitle(t) ?? '').toLowerCase().includes(q)
      if (!titleMatch && !eventMatch) return false
    }
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
    if (task.taskType === 'kaizen_verification') {
      setVerifyTask(task)
      return
    }
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

  const getEventTitle = (t: Task): string | undefined => {
    if (!t.evId && !t.evTemplateId) return undefined
    const id = t.evId ?? t.evTemplateId
    const ev = templates.find(
      (e) => sameId(e.id, id) || sameId(e.taskTemplateId, id)
    )
    return ev?.title
  }

  const FILTER_TABS: FilterTab[] = ['all', 'pending', 'done', 'behind', 'overdue']

  // --- Event Health view data ---
  const allTasks = tasksStore.tasks
  const eventHealthCards = (() => {
    const result: Array<{
      templateId: string | number
      title: string
      date?: string
      taskCount: number
      hasProblem: boolean
      tasks: Task[]
    }> = []

    for (const ev of templates) {
      const evTasks = allTasks.filter(
        (t) =>
          sameId(t.evId ?? t.evTemplateId, ev.id) ||
          sameId(t.evTemplateId, ev.taskTemplateId)
      )
      if (evTasks.length === 0) continue
      const hasProblem = evTasks.some((t) => t.status === 'behind' || isOverdue(t))
      result.push({
        templateId: ev.id,
        title: ev.title,
        date: ev.date,
        taskCount: evTasks.length,
        hasProblem,
        tasks: evTasks,
      })
    }

    // Sort by date ascending, events without dates go last
    return result.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    })
  })()

  const ADMIN_VIEWS: { key: AdminView; label: string }[] = [
    { key: 'mine', label: 'My Tasks' },
    { key: 'all', label: 'All Tasks' },
    { key: 'health', label: 'Event Health' },
  ]

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Assignments' }} />

      {/* Admin view switcher */}
      {admin ? (
        <YStack padding="$3" paddingBottom="$2" borderBottomWidth={1} borderBottomColor={colors.border}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap="$2">
              {ADMIN_VIEWS.map((v) => (
                <Pressable key={v.key} onPress={() => setAdminView(v.key)}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius={99}
                    backgroundColor={adminView === v.key ? colors.primary : 'transparent'}
                    borderWidth={1}
                    borderColor={adminView === v.key ? colors.primary : colors.border}
                  >
                    <Text
                      color={adminView === v.key ? 'white' : colors.text}
                      fontSize="$3"
                      fontWeight={adminView === v.key ? '700' : '400'}
                    >
                      {v.label}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>
          </ScrollView>
        </YStack>
      ) : null}

      {/* Search + filter — only for task views */}
      {adminView !== 'health' ? (
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
      ) : null}

      {/* Event Health view */}
      {adminView === 'health' ? (
        <ScrollView style={{ flex: 1 }}>
          <XStack padding="$3" gap="$3" flexWrap="wrap" alignItems="flex-start">
            {eventHealthCards.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$4"
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
                flex={1}
              >
                <Text color={colors.textMuted}>No events with tasks found.</Text>
              </YStack>
            ) : (
              eventHealthCards.map((card) => (
                <Pressable
                  key={String(card.templateId)}
                  onPress={() => setKanbanEvent({ title: card.title, tasks: card.tasks })}
                  style={{ width: 300 }}
                >
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    padding="$3"
                    gap="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={2}>
                      {card.title}
                    </Text>
                    {card.date ? (
                      <Text color={colors.textMuted} fontSize="$2">
                        {FD(card.date, { weekday: true })}
                      </Text>
                    ) : null}
                    <Text color={colors.textMuted} fontSize="$2">
                      {card.taskCount} task{card.taskCount !== 1 ? 's' : ''}
                    </Text>
                    <XStack>
                      <XStack
                        backgroundColor={card.hasProblem ? '#c0392b' : '#27ae60'}
                        borderRadius={99}
                        paddingHorizontal={10}
                        paddingVertical={3}
                      >
                        <Text color="white" fontSize={11} fontWeight="600">
                          {card.hasProblem ? '⚠ Behind' : '✓ On Track'}
                        </Text>
                      </XStack>
                    </XStack>
                  </YStack>
                </Pressable>
              ))
            )}
          </XStack>
        </ScrollView>
      ) : (
        /* Task list view */
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
                resolveUser={displayName}
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
                resolveUser={displayName}
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
                resolveUser={displayName}
              />
            ) : null}
            {filter === 'all' || filter === 'pending' ? (
              <TaskGroup
                title={`Pending (${allPending.length})`}
                tasks={allPending}
                colors={colors}
                onComplete={handleComplete}
                getEventTitle={getEventTitle}
                resolveUser={displayName}
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
                resolveUser={displayName}
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
      )}

      {/* EventKanban modal */}
      <EventKanban
        tasks={kanbanEvent?.tasks ?? []}
        eventTitle={kanbanEvent?.title ?? ''}
        visible={!!kanbanEvent}
        onClose={() => setKanbanEvent(null)}
        resolveUser={displayName}
      />

      {/* CA Verification modal for kaizen_verification tasks */}
      <CAVerificationModal
        task={verifyTask}
        card={kaizenCards.find((c) => sameId(c.id, verifyTask?.kaizenId ?? ''))}
        uid={uid}
        onClose={() => setVerifyTask(null)}
        onSubmit={async (result) => {
          if (!verifyTask) return
          await submitVerification(verifyTask.kaizenId!, result, verifyTask.id)
          setVerifyTask(null)
          toast('Verification submitted — admin has been notified', 'success')
        }}
      />
    </YStack>
  )
}
