import { useEffect, useState } from 'react'
import { ScrollView, Pressable, Modal, View, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { Stack } from 'expo-router'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUIStore } from '@/stores/uiStore'
import { useKaizenStore } from '@/stores/kaizenStore'
import { useWorshipStore } from '@/stores/worshipStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { TaskCard } from '@/components/ui/TaskCard'
import { EventKanban } from '@/features/events/EventKanban'
import { SetListDetailModal } from '@/features/worship/SetListDetailModal'
import { isAdmin } from '@/lib/roles'
import { isOverdue } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import { httpsCallable } from 'firebase/functions'
import { TASK_SECTIONS, type TaskTemplate } from '@/features/admin/TaskTemplateCard'
import type { Task } from '@/types/events'
import type { KaizenCard, KaizenVerificationResult } from '@/types/operations'
import type { UserProfile } from '@/types/user'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

interface GroupDoc {
  id: string
  name: string
  members: string[]
}

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
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              CA Verification
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          {card?.actionPlan ? (
            <YStack gap="$2">
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  CORRECTIVE ACTION
                </Text>
                <Text color={colors.text} fontSize="$3">
                  {card.actionPlan.description}
                </Text>
              </YStack>
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  VERIFICATION METHOD
                </Text>
                <Text color={colors.text} fontSize="$3">
                  {card.actionPlan.verificationMethod}
                </Text>
              </YStack>
            </YStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$3">
              {task.title}
            </Text>
          )}

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              EFFECTIVENESS
            </Text>
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
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              NOTES
            </Text>
            <TextInput
              style={[
                caStyles.textarea,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
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

function CreateTaskModal({
  visible,
  onClose,
  onSubmit,
  users,
  groups,
  colors,
}: {
  visible: boolean
  onClose: () => void
  onSubmit: (
    title: string,
    assignees: string[],
    lead: string | null,
    dueDate: string
  ) => Promise<void>
  users: UserProfile[]
  groups: GroupDoc[]
  colors: ReturnType<typeof useThemeColors>
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [targetType, setTargetType] = useState<'individuals' | 'group'>('individuals')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedLead, setSelectedLead] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const toggleUser = (uid: string) => {
    setSelectedUsers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    )
  }

  const groupMembers = (() => {
    if (targetType !== 'group' || !selectedGroup) return []
    const g = groups.find((g) => g.id === selectedGroup)
    return g
      ? (g.members
          .map((uid) => users.find((u) => sameId(u.uid, uid)))
          .filter(Boolean) as UserProfile[])
      : []
  })()

  const handleSubmit = async () => {
    if (!title.trim()) return
    const assignees =
      targetType === 'group' ? groupMembers.map((u) => String(u.uid)) : selectedUsers
    if (assignees.length === 0) return
    const lead =
      targetType === 'group' ? selectedLead || null : assignees.length === 1 ? assignees[0] : null
    setSaving(true)
    try {
      await onSubmit(title.trim(), assignees, lead, dueDate)
      setTitle('')
      setDueDate('')
      setSelectedUsers([])
      setSelectedGroup('')
      setSelectedLead('')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit =
    title.trim() &&
    ((targetType === 'individuals' && selectedUsers.length > 0) ||
      (targetType === 'group' && selectedGroup && (groupMembers.length < 2 || selectedLead)))

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ctStyles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$5"
          gap="$3"
          width="92%"
          maxWidth={560}
          maxHeight="90%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Assign Task
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false}>
            <YStack gap="$3">
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  TASK TITLE
                </Text>
                <TextInput
                  style={[
                    ctStyles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Describe the task"
                  placeholderTextColor={colors.textMuted}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  DUE DATE
                </Text>
                <TextInput
                  style={[
                    ctStyles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={dueDate}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '').slice(0, 6)
                    let formatted = digits.slice(0, 2)
                    if (digits.length > 2) formatted += '/' + digits.slice(2, 4)
                    if (digits.length > 4) formatted += '/' + digits.slice(4, 6)
                    setDueDate(formatted)
                  }}
                  placeholder="mm/dd/yy"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  maxLength={8}
                />
              </YStack>

              <YStack gap="$2">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  ASSIGN TO
                </Text>
                <XStack gap="$2">
                  {(['individuals', 'group'] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setTargetType(t)
                        setSelectedUsers([])
                        setSelectedGroup('')
                        setSelectedLead('')
                      }}
                    >
                      <XStack
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius={99}
                        backgroundColor={targetType === t ? colors.primary : 'transparent'}
                        borderWidth={1}
                        borderColor={targetType === t ? colors.primary : colors.border}
                      >
                        <Text
                          color={targetType === t ? 'white' : colors.text}
                          fontSize="$2"
                          fontWeight="600"
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>

              {targetType === 'individuals' ? (
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    SELECT ASSIGNEES ({selectedUsers.length} selected)
                  </Text>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {nonPublicUsers.map((u) => {
                      const sel = selectedUsers.includes(String(u.uid))
                      return (
                        <Pressable key={String(u.uid)} onPress={() => toggleUser(String(u.uid))}>
                          <XStack
                            paddingVertical="$2"
                            paddingHorizontal="$2"
                            gap="$3"
                            alignItems="center"
                            borderBottomWidth={1}
                            borderBottomColor={colors.border}
                            backgroundColor={sel ? colors.primary + '18' : 'transparent'}
                          >
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                borderWidth: 2,
                                borderColor: sel ? colors.primary : colors.border,
                                backgroundColor: sel ? colors.primary : 'transparent',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {sel ? (
                                <Text color="white" fontSize={11}>
                                  ✓
                                </Text>
                              ) : null}
                            </View>
                            <Text color={colors.text} fontSize="$3">
                              {u.displayName || u.email || String(u.uid)}
                            </Text>
                          </XStack>
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      SELECT GROUP
                    </Text>
                    <ScrollView style={{ maxHeight: 160 }}>
                      {groups.map((g) => {
                        const sel = selectedGroup === g.id
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => {
                              setSelectedGroup(g.id)
                              setSelectedLead('')
                            }}
                          >
                            <XStack
                              paddingVertical="$2"
                              paddingHorizontal="$2"
                              gap="$3"
                              alignItems="center"
                              borderBottomWidth={1}
                              borderBottomColor={colors.border}
                              backgroundColor={sel ? colors.primary + '18' : 'transparent'}
                            >
                              <View
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 9,
                                  borderWidth: 2,
                                  borderColor: sel ? colors.primary : colors.border,
                                  backgroundColor: sel ? colors.primary : 'transparent',
                                }}
                              />
                              <YStack>
                                <Text color={colors.text} fontSize="$3">
                                  {g.name}
                                </Text>
                                <Text color={colors.textMuted} fontSize={11}>
                                  {g.members.length} members
                                </Text>
                              </YStack>
                            </XStack>
                          </Pressable>
                        )
                      })}
                    </ScrollView>
                  </YStack>

                  {selectedGroup && groupMembers.length >= 2 ? (
                    <YStack gap="$1">
                      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                        DESIGNATED LEADER
                      </Text>
                      <ScrollView style={{ maxHeight: 160 }}>
                        {groupMembers.map((u) => {
                          const sel = selectedLead === String(u.uid)
                          return (
                            <Pressable
                              key={String(u.uid)}
                              onPress={() => setSelectedLead(String(u.uid))}
                            >
                              <XStack
                                paddingVertical="$2"
                                paddingHorizontal="$2"
                                gap="$3"
                                alignItems="center"
                                borderBottomWidth={1}
                                borderBottomColor={colors.border}
                                backgroundColor={sel ? colors.primary + '18' : 'transparent'}
                              >
                                <View
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    borderWidth: 2,
                                    borderColor: sel ? colors.primary : colors.border,
                                    backgroundColor: sel ? colors.primary : 'transparent',
                                  }}
                                />
                                <Text color={colors.text} fontSize="$3">
                                  {u.displayName}
                                </Text>
                              </XStack>
                            </Pressable>
                          )
                        })}
                      </ScrollView>
                    </YStack>
                  ) : null}
                </YStack>
              )}

              <Pressable onPress={handleSubmit} disabled={saving || !canSubmit}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingVertical="$3"
                  justifyContent="center"
                  opacity={saving || !canSubmit ? 0.5 : 1}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {saving ? 'Assigning…' : 'Assign Task'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ScrollView>
        </YStack>
      </View>
    </Modal>
  )
}

const ctStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
})

type FilterTab = 'all' | 'pending' | 'in_progress' | 'done' | 'behind' | 'overdue'
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
  onTaskPress?: (task: Task) => void
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
  onTaskPress,
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
              onPress={onTaskPress ? () => onTaskPress(t) : undefined}
              eventTitle={getEventTitle(t)}
              assigneeNames={t.assignees.map(resolveUser)}
            />
          ))
        : null}
    </YStack>
  )
}

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return ''
  const [yy, mm, dd] = iso.split('-')
  return `${mm}/${dd}/${yy.slice(2)}`
}

function displayToIso(display: string): string | null {
  if (display.length < 8) return null
  const [mm, dd, yy] = display.split('/')
  return `20${yy}-${mm}-${dd}`
}

function AdminTaskEditModal({
  task,
  onClose,
  onSave,
  onDelete,
  users,
}: {
  task: Task
  onClose: () => void
  onSave: (patch: Partial<Task>) => Promise<void>
  onDelete: () => Promise<void>
  users: UserProfile[]
}) {
  const colors = useThemeColors()
  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState<Task['status']>(task.status)
  const [dueDate, setDueDate] = useState(() => isoToDisplay(task.dueDate))
  const [projectedDate, setProjectedDate] = useState(() => isoToDisplay(task.projectedDate))
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map(String))
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const statusOptions: { value: Task['status']; label: string; color: string }[] = [
    { value: 'pending', label: 'Not Started', color: '#7f8c8d' },
    { value: 'in_progress', label: 'In Progress', color: '#2980b9' },
    { value: 'behind', label: 'Behind', color: '#e67e22' },
    { value: 'done', label: 'Completed', color: '#27ae60' },
  ]

  const formatDateInput = (v: string): string => {
    const digits = v.replace(/\D/g, '').slice(0, 6)
    let out = digits.slice(0, 2)
    if (digits.length > 2) out += '/' + digits.slice(2, 4)
    if (digits.length > 4) out += '/' + digits.slice(4, 6)
    return out
  }

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const patch: Partial<Task> = {
        title: title.trim(),
        status,
        assignees,
        lead: assignees[0] ?? null,
        dueDate: displayToIso(dueDate),
        projectedDate: status === 'behind' ? displayToIso(projectedDate) : null,
      }
      await onSave(patch)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <View style={ctStyles.overlay}>
      <YStack
        backgroundColor={colors.surface}
        borderRadius="$4"
        padding="$4"
        gap="$3"
        width="92%"
        maxWidth={520}
        maxHeight="90%"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={colors.text} fontSize="$5" fontWeight="700">Edit Task</Text>
          <Pressable onPress={onClose}>
            <Text color={colors.textMuted} fontSize="$4">✕</Text>
          </Pressable>
        </XStack>

        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack gap="$3">
            {/* Title */}
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">TITLE</Text>
              <TextInput
                style={[ctStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Task title"
                placeholderTextColor={colors.textMuted}
              />
            </YStack>

            {/* Status */}
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">STATUS</Text>
              <XStack gap="$2" flexWrap="wrap">
                {statusOptions.map((s) => {
                  const active = status === s.value
                  return (
                    <Pressable key={s.value} onPress={() => setStatus(s.value)}>
                      <XStack
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius={99}
                        borderWidth={1}
                        borderColor={s.color}
                        backgroundColor={active ? s.color : 'transparent'}
                      >
                        <Text color={active ? 'white' : s.color} fontSize="$2" fontWeight="600">
                          {s.label}
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                })}
              </XStack>
            </YStack>

            {/* Due date */}
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">DUE DATE</Text>
              <TextInput
                style={[ctStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={dueDate}
                onChangeText={(v) => setDueDate(formatDateInput(v))}
                placeholder="mm/dd/yy"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={8}
              />
            </YStack>

            {/* Projected date — only when Behind */}
            {status === 'behind' ? (
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">PROJECTED DATE</Text>
                <TextInput
                  style={[ctStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={projectedDate}
                  onChangeText={(v) => setProjectedDate(formatDateInput(v))}
                  placeholder="mm/dd/yy"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  maxLength={8}
                />
              </YStack>
            ) : null}

            {/* Assignees */}
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                ASSIGNEES ({assignees.length} selected)
              </Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {nonPublicUsers.map((u) => {
                  const sel = assignees.includes(String(u.uid))
                  return (
                    <Pressable
                      key={String(u.uid)}
                      onPress={() =>
                        setAssignees((prev) =>
                          sel ? prev.filter((id) => id !== String(u.uid)) : [...prev, String(u.uid)]
                        )
                      }
                    >
                      <XStack
                        paddingVertical="$2"
                        paddingHorizontal="$2"
                        gap="$3"
                        alignItems="center"
                        borderBottomWidth={1}
                        borderBottomColor={colors.border}
                        backgroundColor={sel ? colors.primary + '18' : 'transparent'}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 2,
                            borderColor: sel ? colors.primary : colors.border,
                            backgroundColor: sel ? colors.primary : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {sel ? <Text color="white" fontSize={11}>✓</Text> : null}
                        </View>
                        <Text color={colors.text} fontSize="$3">
                          {u.displayName || u.email || String(u.uid)}
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </YStack>
          </YStack>
        </ScrollView>

        {/* Delete */}
        {confirming ? (
          <XStack gap="$2">
            <Pressable onPress={() => setConfirming(false)} style={{ flex: 1 }}>
              <XStack borderWidth={1} borderColor={colors.border} borderRadius="$2" paddingVertical="$2" justifyContent="center">
                <Text color={colors.text} fontWeight="600" fontSize="$3">Cancel</Text>
              </XStack>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={deleting} style={{ flex: 1 }}>
              <XStack backgroundColor="#c0392b" borderRadius="$2" paddingVertical="$2" justifyContent="center" opacity={deleting ? 0.5 : 1}>
                <Text color="white" fontWeight="600" fontSize="$3">{deleting ? 'Deleting…' : 'Confirm Delete'}</Text>
              </XStack>
            </Pressable>
          </XStack>
        ) : (
          <XStack gap="$2">
            <Pressable onPress={() => setConfirming(true)} style={{ flex: 1 }}>
              <XStack borderWidth={1} borderColor="#c0392b" borderRadius="$2" paddingVertical="$2" justifyContent="center">
                <Text color="#c0392b" fontWeight="600" fontSize="$3">Delete</Text>
              </XStack>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving || !title.trim()} style={{ flex: 2 }}>
              <XStack backgroundColor={colors.primary} borderRadius="$2" paddingVertical="$2" justifyContent="center" opacity={saving ? 0.5 : 1}>
                <Text color="white" fontWeight="700" fontSize="$3">{saving ? 'Saving…' : 'Save'}</Text>
              </XStack>
            </Pressable>
          </XStack>
        )}
      </YStack>
    </View>
  )
}

function AdminTaskEditWrapper({
  task,
  onClose,
  onSave,
  onDelete,
  users,
}: {
  task: Task | null
  onClose: () => void
  onSave: (patch: Partial<Task>) => Promise<void>
  onDelete: () => Promise<void>
  users: UserProfile[]
}) {
  return (
    <Modal visible={!!task} animationType="slide" transparent onRequestClose={onClose}>
      {task ? (
        <AdminTaskEditModal
          key={String(task.id)}
          task={task}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
          users={users}
        />
      ) : (
        <View />
      )}
    </Modal>
  )
}

function taskToDisplayDate(task: Task): string {
  if (task.projectedDate && task.projectedDate.length === 10) {
    const [yy, mm, dd] = task.projectedDate.split('-')
    return `${mm}/${dd}/${yy.slice(2)}`
  }
  return ''
}

function TaskUpdateModalInner({
  task,
  onClose,
  onSave,
  onEdit,
}: {
  task: Task
  onClose: () => void
  onSave: (status: 'pending' | 'in_progress' | 'behind', projectedDate: string) => Promise<void>
  onEdit?: () => void
}) {
  const colors = useThemeColors()
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'behind'>(
    task.status === 'behind' ? 'behind' : task.status === 'in_progress' ? 'in_progress' : 'pending'
  )
  const [projectedDate, setProjectedDate] = useState(() => taskToDisplayDate(task))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(status, projectedDate)
    } finally {
      setSaving(false)
    }
  }

  const statusColors: Record<'pending' | 'in_progress' | 'behind', string> = {
    pending: '#7f8c8d',
    in_progress: '#2980b9',
    behind: '#e67e22',
  }

  const statusLabels: Record<'pending' | 'in_progress' | 'behind', string> = {
    pending: 'Not Started',
    in_progress: 'In Progress',
    behind: 'Behind',
  }

  return (
    <View style={tuStyles.overlay}>
      <YStack
        backgroundColor={colors.surface}
        borderRadius="$4"
        padding="$5"
        gap="$3"
        width="90%"
        maxWidth={440}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={colors.text} fontSize="$5" fontWeight="700">
            Update Task
          </Text>
          <XStack gap="$3" alignItems="center">
            {onEdit ? (
              <Pressable onPress={onEdit}>
                <Text color={colors.primary} fontSize="$2" fontWeight="600">
                  Full Edit
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>
        </XStack>

        <Text color={colors.textMuted} fontSize="$3" numberOfLines={2}>
          {task.title}
        </Text>

        <YStack gap="$2">
          <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
            STATUS
          </Text>
          <XStack gap="$2">
            {(['pending', 'in_progress', 'behind'] as const).map((s) => {
              const active = status === s
              return (
                <Pressable key={s} onPress={() => setStatus(s)}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$1"
                    borderRadius={99}
                    borderWidth={1}
                    borderColor={statusColors[s]}
                    backgroundColor={active ? statusColors[s] : 'transparent'}
                  >
                    <Text color={active ? 'white' : statusColors[s]} fontSize="$2" fontWeight="600">
                      {statusLabels[s]}
                    </Text>
                  </XStack>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>

        {status === 'behind' ? (
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              PROJECTED DATE
            </Text>
            <TextInput
              style={[
                tuStyles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
              value={projectedDate}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 6)
                let formatted = digits.slice(0, 2)
                if (digits.length > 2) formatted += '/' + digits.slice(2, 4)
                if (digits.length > 4) formatted += '/' + digits.slice(4, 6)
                setProjectedDate(formatted)
              }}
              placeholder="mm/dd/yy"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={8}
            />
          </YStack>
        ) : null}

        <Pressable onPress={handleSave} disabled={saving}>
          <XStack
            backgroundColor={colors.primary}
            borderRadius="$2"
            paddingVertical="$3"
            justifyContent="center"
            opacity={saving ? 0.5 : 1}
          >
            <Text color="white" fontWeight="700" fontSize="$3">
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </XStack>
        </Pressable>
      </YStack>
    </View>
  )
}

function TaskUpdateModal({
  task,
  onClose,
  onSave,
  onEdit,
}: {
  task: Task | null
  uid: string
  onClose: () => void
  onSave: (status: 'pending' | 'in_progress' | 'behind', projectedDate: string) => Promise<void>
  onEdit?: () => void
}) {
  return (
    <Modal visible={!!task} animationType="slide" transparent onRequestClose={onClose}>
      {task ? (
        <TaskUpdateModalInner key={String(task.id)} task={task} onClose={onClose} onSave={onSave} onEdit={onEdit} />
      ) : (
        <View />
      )}
    </Modal>
  )
}

const tuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
})

export default function Assignments() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

  const tasksStore = useTasksStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { templates, subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { users: allUsers } = useUsersStore()
  const { getMemberUids } = useGroupsStore()
  const {
    cards: kaizenCards,
    subscribe: subKaizen,
    unsubscribe: unsubKaizen,
    submitVerification,
  } = useKaizenStore()
  const { setLists, subscribe: subWorship, unsubscribe: unsubWorship } = useWorshipStore()
  const displayName = (uid: string | number): string => {
    const u = allUsers.find((x) => String(x.uid) === String(uid))
    return u?.displayName || u?.email || String(uid)
  }
  const toast = useUIStore((s) => s.toast)

  const [adminView, setAdminView] = useState<AdminView>('mine')
  const [kanbanEvent, setKanbanEvent] = useState<{ title: string; tasks: Task[] } | null>(null)
  const [verifyTask, setVerifyTask] = useState<Task | null>(null)
  const [updateTaskItem, setUpdateTaskItem] = useState<Task | null>(null)
  const [editTaskItem, setEditTaskItem] = useState<Task | null>(null)
  const [setListAckTask, setSetListAckTask] = useState<Task | null>(null)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [groups, setGroups] = useState<GroupDoc[]>([])

  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [spawning, setSpawning] = useState<string | number | null>(null)

  useEffect(() => {
    subTasks()
    subEvents()
    subKaizen()
    subWorship()
    const unsub = onSnapshot(collection(db, 'taskTemplates'), (snap) => {
      setTaskTemplates(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TaskTemplate))
    })
    return () => {
      unsubTasks()
      unsubEvents()
      unsubKaizen()
      unsubWorship()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!admin) return
    const unsub = onSnapshot(collection(db, 'groups'), (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GroupDoc))
    })
    return () => unsub()
  }, [admin])

  const baseTasks = adminView === 'all' ? tasksStore.tasks : tasksStore.myTasks(uid)

  const filtered = baseTasks.filter((t) => {
    if (search) {
      const q = search.toLowerCase()
      const titleMatch = t.title.toLowerCase().includes(q)
      const eventMatch = (getEventTitle(t) ?? '').toLowerCase().includes(q)
      if (!titleMatch && !eventMatch) return false
    }
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'in_progress') return t.status === 'in_progress'
    if (filter === 'done') return t.status === 'done'
    if (filter === 'behind') return t.status === 'behind'
    if (filter === 'overdue') return isOverdue(t)
    return true
  })

  const overdue = filtered.filter((t) => isOverdue(t))
  const behind = filtered.filter((t) => t.status === 'behind' && !isOverdue(t))
  const inProgress = filtered.filter((t) => t.status === 'in_progress' && !isOverdue(t))
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

  const handleTaskPress = (t: Task) => {
    if (
      t.taskType === 'kaizen_verification' ||
      t.taskType === 'kaizen_action' ||
      t.taskType === 'issue_corrective'
    ) return
    if (!admin && !t.assignees.some((a) => String(a) === String(uid))) return
    if (!admin && t.status === 'done') return
    if (t.taskType === 'worship_setlist_ack') {
      if (t.status !== 'done') setSetListAckTask(t)
      return
    }
    setUpdateTaskItem(t)
  }

  const handleAdminEditTask = async (patch: Partial<Task>) => {
    if (!editTaskItem) return
    try {
      await tasksStore.updateTask(editTaskItem.id, patch)
      toast('Task updated', 'success')
      setEditTaskItem(null)
    } catch {
      toast('Failed to update task', 'error')
    }
  }

  const handleAdminDeleteTask = async () => {
    if (!editTaskItem) return
    try {
      await tasksStore.deleteTask(editTaskItem.id)
      toast('Task deleted', 'success')
      setEditTaskItem(null)
    } catch {
      toast('Failed to delete task', 'error')
    }
  }

  const handleComplete = async (task: Task) => {
    if (task.taskType === 'kaizen_verification') {
      setVerifyTask(task)
      return
    }
    if (task.taskType === 'worship_setlist_ack') {
      setSetListAckTask(task)
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

  const handleUpdateTask = async (status: 'pending' | 'in_progress' | 'behind', projectedDate: string) => {
    if (!updateTaskItem) return
    let storedDate: string | undefined
    if (projectedDate && projectedDate.length === 8) {
      const [mm, dd, yy] = projectedDate.split('/')
      storedDate = `20${yy}-${mm}-${dd}`
    }
    try {
      await tasksStore.updateTask(updateTaskItem.id, {
        status,
        projectedDate: storedDate,
      })
      toast('Task updated', 'success')
      setUpdateTaskItem(null)
    } catch {
      toast('Failed to update task', 'error')
    }
  }

  const getEventTitle = (t: Task): string | undefined => {
    if (!t.evId && !t.evTemplateId) return undefined
    const id = t.evId ?? t.evTemplateId
    const ev = templates.find((e) => sameId(e.id, id) || sameId(e.taskTemplateId, id))
    return ev?.title
  }

  const FILTER_TABS: FilterTab[] = ['all', 'pending', 'in_progress', 'done', 'behind', 'overdue']

  const FILTER_LABELS: Record<FilterTab, string> = {
    all: 'All',
    pending: 'Not Started',
    in_progress: 'In Progress',
    done: 'Completed',
    behind: 'Behind',
    overdue: 'Overdue',
  }

  // --- Event Health view data ---
  const allTasks = tasksStore.tasks
  const { createTask } = useTasksStore()
  const eventHealthCards = (() => {
    const result: {
      templateId: string | number
      title: string
      date?: string
      taskCount: number
      hasProblem: boolean
      tasks: Task[]
      sectionStatus: { id: string; label: string; color: string; hasProblem: boolean }[]
      canSpawn: boolean
    }[] = []

    for (const ev of templates) {
      if (!ev.taskTemplateId) continue
      const evTasks = allTasks.filter(
        (t) => sameId(t.evId ?? t.evTemplateId, ev.id) || sameId(t.evTemplateId, ev.taskTemplateId)
      )
      const hasProblem = evTasks.some((t) => t.status === 'behind' || isOverdue(t))
      const tpl = taskTemplates.find((tt) => sameId(tt.id, ev.taskTemplateId))
      const sectionStatus = TASK_SECTIONS.flatMap((s) => {
        if (!tpl || evTasks.length === 0) return []
        const sectionTitles = (tpl.tasks ?? []).filter((t) => t.section === s.id).map((t) => t.title)
        if (sectionTitles.length === 0) return []
        const sTasks = evTasks.filter((t) => sectionTitles.includes(t.title))
        if (sTasks.length === 0) return []
        const label = tpl.sectionLabels?.[s.id] ?? s.label
        return [{ id: s.id, label, color: s.color, hasProblem: sTasks.some((t) => t.status === 'behind' || isOverdue(t)) }]
      })
      result.push({
        templateId: ev.id,
        title: ev.title,
        date: ev.date,
        taskCount: evTasks.length,
        hasProblem,
        tasks: evTasks,
        sectionStatus,
        canSpawn: evTasks.length === 0 && !!tpl,
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

  const spawnTasksForEvent = async (card: (typeof eventHealthCards)[0]) => {
    const ev = templates.find((t) => sameId(t.id, card.templateId))
    const tpl = taskTemplates.find((tt) => sameId(tt.id, ev?.taskTemplateId))
    if (!ev || !tpl) return
    setSpawning(card.templateId)
    try {
      for (const taskItem of tpl.tasks ?? []) {
        if (!taskItem.title.trim()) continue
        let dueDate: string | null = null
        if (taskItem.daysAfterEvent && taskItem.daysAfterEvent > 0 && ev.date) {
          const d = new Date(ev.date)
          d.setDate(d.getDate() + taskItem.daysAfterEvent)
          dueDate = d.toISOString().split('T')[0]
        } else if (ev.date && taskItem.daysBefore > 0) {
          const d = new Date(ev.date)
          d.setDate(d.getDate() - taskItem.daysBefore)
          dueDate = d.toISOString().split('T')[0]
        }
        const groupUids = getMemberUids(taskItem.assigneeGroups ?? [])
        const allAssignees = [
          ...new Set([...(taskItem.assignees ?? []), ...groupUids]),
        ]
        await createTask({
          title: taskItem.title,
          assignees: allAssignees,
          lead: allAssignees[0] ?? null,
          by: profile?.uid ?? '',
          status: 'pending',
          evTemplateId: ev.id,
          evDate: ev.date ?? null,
          dueDate,
        })
      }
      toast('Tasks spawned', 'success')
    } catch {
      toast('Failed to spawn tasks', 'error')
    } finally {
      setSpawning(null)
    }
  }

  const ADMIN_VIEWS: { key: AdminView; label: string }[] = [
    { key: 'mine', label: 'My Tasks' },
    { key: 'all', label: 'All Tasks' },
    { key: 'health', label: 'Event Health' },
  ]

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Assignments' }} />

      {/* Admin view switcher */}
      {admin ? (
        <YStack
          padding="$3"
          paddingBottom="$2"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
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
                      {FILTER_LABELS[f]}
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
                <Text color={colors.textMuted}>No events with a task template found.</Text>
              </YStack>
            ) : (
              eventHealthCards.map((card) => (
                <Pressable
                  key={String(card.templateId)}
                  onPress={card.canSpawn ? undefined : () => setKanbanEvent({ title: card.title, tasks: card.tasks })}
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
                    {card.canSpawn ? (
                      <Pressable onPress={() => spawnTasksForEvent(card)}>
                        <XStack
                          backgroundColor={spawning === card.templateId ? colors.border : colors.primary}
                          borderRadius={99}
                          paddingHorizontal={10}
                          paddingVertical={4}
                          alignSelf="flex-start"
                        >
                          <Text color="white" fontSize={11} fontWeight="600">
                            {spawning === card.templateId ? 'Spawning…' : '+ Spawn Tasks'}
                          </Text>
                        </XStack>
                      </Pressable>
                    ) : (
                      <>
                        <Text color={colors.textMuted} fontSize="$2">
                          {card.taskCount} task{card.taskCount !== 1 ? 's' : ''}
                        </Text>
                        {card.sectionStatus.length > 0 ? (
                          <XStack flexWrap="wrap" gap="$1">
                            {card.sectionStatus.map((s) => (
                              <XStack
                                key={s.id}
                                backgroundColor={s.hasProblem ? '#c0392b' : '#27ae60'}
                                borderRadius={99}
                                paddingHorizontal={8}
                                paddingVertical={2}
                              >
                                <Text color="white" fontSize={10} fontWeight="600">
                                  {s.hasProblem ? `⚠ ${s.label}` : `✓ ${s.label}`}
                                </Text>
                              </XStack>
                            ))}
                          </XStack>
                        ) : (
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
                        )}
                      </>
                    )}
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
                onTaskPress={handleTaskPress}
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
                onTaskPress={handleTaskPress}
                getEventTitle={getEventTitle}
                resolveUser={displayName}
              />
            ) : null}
            {filter === 'all' || filter === 'in_progress' ? (
              <TaskGroup
                title={`▶ In Progress (${inProgress.length})`}
                tasks={inProgress}
                color="#2980b9"
                colors={colors}
                onComplete={handleComplete}
                onTaskPress={handleTaskPress}
                getEventTitle={getEventTitle}
                resolveUser={displayName}
              />
            ) : null}
            {filter === 'all' || filter === 'pending' ? (
              <TaskGroup
                title={`📅 Due This Week (${upcoming.length})`}
                tasks={upcoming}
                color="#7f8c8d"
                colors={colors}
                onComplete={handleComplete}
                onTaskPress={handleTaskPress}
                getEventTitle={getEventTitle}
                resolveUser={displayName}
              />
            ) : null}
            {filter === 'all' || filter === 'pending' ? (
              <TaskGroup
                title={`Not Started (${allPending.length})`}
                tasks={allPending}
                color="#7f8c8d"
                colors={colors}
                onComplete={handleComplete}
                onTaskPress={handleTaskPress}
                getEventTitle={getEventTitle}
                resolveUser={displayName}
              />
            ) : null}
            {filter === 'all' || filter === 'done' ? (
              <TaskGroup
                title={`✓ Completed (${done.length})`}
                tasks={done}
                color="#27ae60"
                collapsed={filter === 'all' && !showDone}
                onToggle={filter === 'all' ? () => setShowDone((v) => !v) : undefined}
                colors={colors}
                onComplete={handleComplete}
                onTaskPress={handleTaskPress}
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

      {/* Admin FAB to assign task */}
      {admin ? (
        <Pressable
          onPress={() => setShowCreateTask(true)}
          style={[fabStyle, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$3">
            ⊕ Assign Task
          </Text>
        </Pressable>
      ) : null}

      {/* Create Task Modal */}
      {admin ? (
        <CreateTaskModal
          visible={showCreateTask}
          onClose={() => setShowCreateTask(false)}
          onSubmit={async (title, assignees, lead, dueDate) => {
            // Convert mm/dd/yy to YYYY-MM-DD for storage
            let storedDate: string | null = null
            if (dueDate && dueDate.length === 8) {
              const [mm, dd, yy] = dueDate.split('/')
              storedDate = `20${yy}-${mm}-${dd}`
            }
            await tasksStore.createTask({
              title,
              assignees,
              lead,
              by: uid,
              status: 'pending',
              dueDate: storedDate,
            })
            toast('Task assigned!', 'success')
            setShowCreateTask(false)
          }}
          users={allUsers}
          groups={groups}
          colors={colors}
        />
      ) : null}

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

      {/* Task status update modal */}
      <TaskUpdateModal
        task={updateTaskItem}
        uid={uid}
        onClose={() => setUpdateTaskItem(null)}
        onSave={handleUpdateTask}
        onEdit={admin ? () => { setEditTaskItem(updateTaskItem); setUpdateTaskItem(null) } : undefined}
      />

      {/* Full admin task edit modal */}
      <AdminTaskEditWrapper
        task={editTaskItem}
        onClose={() => setEditTaskItem(null)}
        onSave={handleAdminEditTask}
        onDelete={handleAdminDeleteTask}
        users={allUsers}
      />

      {/* Set list acknowledgment modal */}
      <SetListDetailModal
        setList={
          setListAckTask?.setListId != null
            ? (setLists.find((sl) => sameId(sl.id, setListAckTask.setListId!)) ?? null)
            : null
        }
        ackTask={setListAckTask}
        onClose={() => setSetListAckTask(null)}
      />
    </YStack>
  )
}

const fabStyle: import('react-native').ViewStyle = {
  position: 'absolute',
  bottom: 16,
  right: 16,
  borderRadius: 20,
  paddingHorizontal: 16,
  paddingVertical: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 5,
}
