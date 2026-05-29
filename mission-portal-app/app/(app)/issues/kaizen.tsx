import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, Modal, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useKaizenStore } from '@/stores/kaizenStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import type { KaizenCard, KaizenStatus, KaizenActionTask } from '@/types/operations'
import type { UserProfile } from '@/types/user'

const COLUMNS: { key: KaizenStatus; label: string; color: string }[] = [
  { key: 'idea', label: 'Idea', color: '#2980b9' },
  { key: 'in_progress', label: 'In Progress', color: '#e67e22' },
  { key: 'implementation', label: 'Implementation', color: '#8e44ad' },
  { key: 'completed', label: 'Completed', color: '#27ae60' },
]

const NEXT_STATUS: Partial<Record<KaizenStatus, KaizenStatus>> = {
  idea: 'in_progress',
  in_progress: 'implementation',
  implementation: 'completed',
}
const PREV_STATUS: Partial<Record<KaizenStatus, KaizenStatus>> = {
  in_progress: 'idea',
  implementation: 'in_progress',
  completed: 'implementation',
}

// --- Reusable user picker ---
function UserPickerModal({
  visible,
  onClose,
  onSelect,
  users,
  selectedUid,
  colors,
}: {
  visible: boolean
  onClose: () => void
  onSelect: (uid: string) => void
  users: UserProfile[]
  selectedUid: string
  colors: ReturnType<typeof useThemeColors>
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          width="80%"
          maxWidth={400}
          maxHeight="70%"
        >
          <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
            <Text color={colors.text} fontSize="$4" fontWeight="700">Select User</Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>
          <ScrollView>
            {users.map((u) => (
              <Pressable
                key={String(u.uid)}
                onPress={() => { onSelect(String(u.uid)); onClose() }}
              >
                <XStack
                  paddingVertical="$3"
                  paddingHorizontal="$2"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                  backgroundColor={sameId(u.uid, selectedUid) ? colors.primary + '22' : 'transparent'}
                >
                  <Text color={colors.text} fontSize="$3">{u.displayName}</Text>
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        </YStack>
      </View>
    </Modal>
  )
}

// --- Action Plan Task Row ---
function ActionTaskRow({
  task,
  index,
  onChange,
  onRemove,
  users,
  colors,
}: {
  task: Omit<KaizenActionTask, 'taskId'>
  index: number
  onChange: (t: Omit<KaizenActionTask, 'taskId'>) => void
  onRemove: () => void
  users: UserProfile[]
  colors: ReturnType<typeof useThemeColors>
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const selectedUser = users.find((u) => sameId(u.uid, task.assignee))

  return (
    <YStack
      borderWidth={1}
      borderColor={colors.border}
      borderRadius="$2"
      padding="$2"
      gap="$2"
      backgroundColor={colors.background}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text color={colors.textMuted} fontSize="$2" fontWeight="600">TASK {index + 1}</Text>
        <Pressable onPress={onRemove}>
          <Text color="#c0392b" fontSize="$2">Remove</Text>
        </Pressable>
      </XStack>

      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        value={task.description}
        onChangeText={(v) => onChange({ ...task, description: v })}
        placeholder="Task description"
        placeholderTextColor={colors.textMuted}
      />

      <Pressable onPress={() => setPickerOpen(true)}>
        <XStack
          borderWidth={1}
          borderColor={colors.border}
          borderRadius="$2"
          padding={10}
          backgroundColor={colors.surface}
        >
          <Text color={selectedUser ? colors.text : colors.textMuted} fontSize="$3">
            {selectedUser ? selectedUser.displayName : 'Assign to…'}
          </Text>
        </XStack>
      </Pressable>

      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        value={task.dueDate}
        onChangeText={(v) => onChange({ ...task, dueDate: v })}
        placeholder="Due date (YYYY-MM-DD)"
        placeholderTextColor={colors.textMuted}
      />

      <UserPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(uid) => onChange({ ...task, assignee: uid })}
        users={users}
        selectedUid={String(task.assignee)}
        colors={colors}
      />
    </YStack>
  )
}

// --- Kaizen Card ---
function KaizenCardItem({
  card,
  uid,
  admin,
  colors,
  users,
  onUpvote,
  onMove,
  onDelete,
}: {
  card: KaizenCard
  uid: string
  admin: boolean
  colors: ReturnType<typeof useThemeColors>
  users: UserProfile[]
  onUpvote: () => void
  onMove: (dir: 'forward' | 'back') => void
  onDelete: () => void
}) {
  const hasVoted = card.upvotes.some((u) => sameId(u, uid))
  const displayName = (id: string | number) => {
    const u = users.find((x) => sameId(x.uid, id))
    return u?.displayName ?? String(id)
  }

  const upvoterNames = card.upvotes
    .filter((u) => !sameId(u, card.createdBy))
    .map(displayName)
    .join(', ')

  const canGoForward = !!NEXT_STATUS[card.status]
  const canGoBack = !!PREV_STATUS[card.status]

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$3"
      padding="$3"
      gap="$2"
      borderWidth={1}
      borderColor={colors.border}
      marginBottom="$2"
    >
      <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={2}>
        {card.title}
      </Text>
      {card.description ? (
        <Text color={colors.textMuted} fontSize="$2" numberOfLines={3}>
          {card.description}
        </Text>
      ) : null}

      {/* Creator */}
      <Text color={colors.textMuted} fontSize="$2">by {displayName(card.createdBy)}</Text>

      {/* Upvotes */}
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Pressable onPress={onUpvote}>
          <XStack
            borderRadius={99}
            paddingHorizontal="$3"
            paddingVertical="$1"
            backgroundColor={hasVoted ? colors.primary : 'transparent'}
            borderWidth={1}
            borderColor={hasVoted ? colors.primary : colors.border}
            alignItems="center"
            gap="$1"
          >
            <Text color={hasVoted ? 'white' : colors.textMuted} fontSize="$2">
              👍 {card.upvotes.length}
            </Text>
          </XStack>
        </Pressable>
        {upvoterNames ? (
          <Text color={colors.textMuted} fontSize={11}>
            {upvoterNames}
          </Text>
        ) : null}
      </XStack>

      {/* Action plan status */}
      {card.actionPlan ? (
        <XStack gap="$2" flexWrap="wrap">
          <XStack
            backgroundColor={card.actionPlan.verificationResult ? '#27ae60' : '#8e44ad'}
            borderRadius={99}
            paddingHorizontal={8}
            paddingVertical={2}
          >
            <Text color="white" fontSize={10} fontWeight="600">
              {card.actionPlan.verificationResult ? '✓ Verified' : 'Action Plan Active'}
            </Text>
          </XStack>
          <Text color={colors.textMuted} fontSize={11}>
            {card.actionPlan.tasks.length} task{card.actionPlan.tasks.length !== 1 ? 's' : ''}
          </Text>
        </XStack>
      ) : null}

      {/* Admin controls */}
      {admin ? (
        <XStack gap="$2" marginTop="$1" flexWrap="wrap">
          {canGoForward ? (
            <Pressable onPress={() => onMove('forward')}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  Move → {COLUMNS.find((c) => c.key === NEXT_STATUS[card.status])?.label}
                </Text>
              </XStack>
            </Pressable>
          ) : null}
          {canGoBack ? (
            <Pressable onPress={() => onMove('back')}>
              <XStack
                borderWidth={1}
                borderColor={colors.border}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color={colors.textMuted} fontSize="$2">
                  ← {COLUMNS.find((c) => c.key === PREV_STATUS[card.status])?.label}
                </Text>
              </XStack>
            </Pressable>
          ) : null}
          <Pressable onPress={onDelete}>
            <XStack
              borderWidth={1}
              borderColor="#c0392b"
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              <Text color="#c0392b" fontSize="$2">Delete</Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  )
}

export default function Kaizen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)

  const { cards, subscribe, unsubscribe, addCard, moveCard, toggleUpvote, saveActionPlan, deleteCard, prerequisitesMet } = useKaizenStore()
  const { tasks, subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { users } = useUsersStore()
  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))

  useEffect(() => {
    subscribe()
    subTasks()
    return () => { unsubscribe(); unsubTasks() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Add Idea modal ---
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaDesc, setIdeaDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddIdea = async () => {
    if (!ideaTitle.trim()) return
    setSubmitting(true)
    try {
      await addCard({ title: ideaTitle.trim(), description: ideaDesc.trim(), createdBy: uid })
      toast('Idea submitted!', 'success')
      setIdeaOpen(false)
      setIdeaTitle('')
      setIdeaDesc('')
    } catch {
      toast('Failed to submit idea', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Action Plan modal ---
  const [planCard, setPlanCard] = useState<KaizenCard | null>(null)
  const [planDesc, setPlanDesc] = useState('')
  const [planTasks, setPlanTasks] = useState<Omit<KaizenActionTask, 'taskId'>[]>([
    { assignee: '', description: '', dueDate: '' },
  ])
  const [planVerifMethod, setPlanVerifMethod] = useState('')
  const [planVerifId, setPlanVerifId] = useState('')
  const [planReviewDate, setPlanReviewDate] = useState('')
  const [planVerifPickerOpen, setPlanVerifPickerOpen] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  const openActionPlan = (card: KaizenCard) => {
    setPlanCard(card)
    setPlanDesc(card.actionPlan?.description ?? '')
    setPlanTasks(
      card.actionPlan?.tasks.map((t) => ({
        assignee: String(t.assignee),
        description: t.description,
        dueDate: t.dueDate,
      })) ?? [{ assignee: '', description: '', dueDate: '' }]
    )
    setPlanVerifMethod(card.actionPlan?.verificationMethod ?? '')
    setPlanVerifId(String(card.actionPlan?.verifierId ?? ''))
    setPlanReviewDate(card.actionPlan?.reviewDate ?? '')
  }

  const handleSavePlan = async () => {
    if (!planCard || !planDesc.trim() || !planVerifMethod.trim() || !planVerifId || !planReviewDate) return
    const validTasks = planTasks.filter((t) => t.description.trim() && t.assignee && t.dueDate)
    if (validTasks.length === 0) {
      toast('Add at least one task', 'error')
      return
    }
    setSavingPlan(true)
    try {
      await saveActionPlan(planCard.id, {
        description: planDesc.trim(),
        tasks: validTasks,
        verificationMethod: planVerifMethod.trim(),
        verifierId: planVerifId,
        reviewDate: planReviewDate,
        createdBy: uid,
      })
      toast('Action plan saved and tasks assigned', 'success')
      setPlanCard(null)
    } catch (e) {
      toast('Failed to save action plan', 'error')
    } finally {
      setSavingPlan(false)
    }
  }

  // --- Delete modal ---
  const [deleteTarget, setDeleteTarget] = useState<KaizenCard | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return
    setDeleting(true)
    try {
      await deleteCard(deleteTarget.id, deleteReason.trim(), uid)
      toast('Card deleted and notifications sent', 'success')
      setDeleteTarget(null)
      setDeleteReason('')
    } catch {
      toast('Failed to delete card', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleMove = async (card: KaizenCard, dir: 'forward' | 'back') => {
    const targetStatus = dir === 'forward' ? NEXT_STATUS[card.status] : PREV_STATUS[card.status]
    if (!targetStatus) return

    // Moving to implementation requires action plan
    if (targetStatus === 'implementation') {
      openActionPlan(card)
      return
    }

    // Moving to completed requires prerequisites
    if (targetStatus === 'completed') {
      const { ok, message } = prerequisitesMet(card.id)
      if (!ok) {
        toast(message ?? 'Prerequisites not met', 'error')
        return
      }
    }

    try {
      await moveCard(card.id, targetStatus)
      toast(`Moved to ${COLUMNS.find((c) => c.key === targetStatus)?.label}`, 'success')
    } catch {
      toast('Failed to move card', 'error')
    }
  }

  const displayName = (id: string | number) => {
    const u = users.find((x) => sameId(x.uid, id))
    return u?.displayName ?? String(id)
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Kaizen Board' }} />

      {/* Kanban columns */}
      <ScrollView horizontal style={{ flex: 1 }} showsHorizontalScrollIndicator={false}>
        <XStack gap="$3" padding="$3" alignItems="flex-start">
          {COLUMNS.map((col) => {
            const colCards = cards
              .filter((c) => c.status === col.key)
              .sort((a, b) => b.upvotes.length - a.upvotes.length)

            return (
              <YStack key={col.key} width={280}>
                {/* Column header */}
                <XStack
                  paddingVertical="$2"
                  paddingHorizontal="$2"
                  marginBottom="$2"
                  borderBottomWidth={2}
                  borderBottomColor={col.color}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Text color={colors.text} fontWeight="700" fontSize="$4">{col.label}</Text>
                  <XStack
                    backgroundColor={col.color}
                    borderRadius={99}
                    paddingHorizontal={8}
                    paddingVertical={2}
                  >
                    <Text color="white" fontSize={11} fontWeight="600">{colCards.length}</Text>
                  </XStack>
                </XStack>

                {/* Cards */}
                <View style={{ maxHeight: 600 }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {colCards.length === 0 ? (
                      <YStack
                        padding="$3"
                        borderWidth={1}
                        borderColor={colors.border}
                        borderRadius="$2"
                        borderStyle="dashed"
                        alignItems="center"
                      >
                        <Text color={colors.textMuted} fontSize="$2">No cards</Text>
                      </YStack>
                    ) : (
                      colCards.map((card) => (
                        <KaizenCardItem
                          key={String(card.id)}
                          card={card}
                          uid={uid}
                          admin={admin}
                          colors={colors}
                          users={users}
                          onUpvote={() => toggleUpvote(card.id, uid)}
                          onMove={(dir) => handleMove(card, dir)}
                          onDelete={() => { setDeleteTarget(card); setDeleteReason('') }}
                        />
                      ))
                    )}
                  </ScrollView>
                </View>
              </YStack>
            )
          })}
        </XStack>
      </ScrollView>

      {/* Submit Idea FAB */}
      <Pressable
        onPress={() => setIdeaOpen(true)}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Text color="white" fontWeight="700" fontSize="$3">⊕ Submit Idea</Text>
      </Pressable>

      {/* Add Idea Modal */}
      <Modal visible={ideaOpen} animationType="slide" transparent onRequestClose={() => setIdeaOpen(false)}>
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$5"
            gap="$3"
            width="90%"
            maxWidth={480}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">Submit a Kaizen Idea</Text>
              <Pressable onPress={() => setIdeaOpen(false)}>
                <Text color={colors.textMuted} fontSize="$4">✕</Text>
              </Pressable>
            </XStack>

            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">TITLE</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={ideaTitle}
                onChangeText={setIdeaTitle}
                placeholder="What's the improvement idea?"
                placeholderTextColor={colors.textMuted}
              />
            </YStack>

            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                DESCRIPTION <Text color={colors.textMuted} fontSize="$2" fontWeight="400">(optional)</Text>
              </Text>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={ideaDesc}
                onChangeText={setIdeaDesc}
                placeholder="Describe the idea and its benefits"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </YStack>

            <Pressable onPress={handleAddIdea} disabled={submitting || !ideaTitle.trim()}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={submitting || !ideaTitle.trim() ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {submitting ? 'Submitting…' : 'Submit Idea'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        </View>
      </Modal>

      {/* Action Plan Modal */}
      <Modal
        visible={!!planCard}
        animationType="slide"
        transparent
        onRequestClose={() => setPlanCard(null)}
      >
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$5"
            width="95%"
            maxWidth={580}
            maxHeight="95%"
          >
            <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
              <Text color={colors.text} fontSize="$5" fontWeight="700">Action Plan</Text>
              <Pressable onPress={() => setPlanCard(null)}>
                <Text color={colors.textMuted} fontSize="$4">✕</Text>
              </Pressable>
            </XStack>

            {planCard ? (
              <Text color={colors.textMuted} fontSize="$3" marginBottom="$3">
                "{planCard.title}"
              </Text>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$3">

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">WHAT WILL BE DONE</Text>
                  <TextInput
                    style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={planDesc}
                    onChangeText={setPlanDesc}
                    placeholder="Describe the improvement action"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </YStack>

                <YStack gap="$2">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">TASKS</Text>
                    <Pressable
                      onPress={() => setPlanTasks((t) => [...t, { assignee: '', description: '', dueDate: '' }])}
                    >
                      <Text color={colors.primary} fontSize="$2" fontWeight="600">+ Add Task</Text>
                    </Pressable>
                  </XStack>
                  {planTasks.map((t, i) => (
                    <ActionTaskRow
                      key={i}
                      task={t}
                      index={i}
                      onChange={(updated) => setPlanTasks((arr) => arr.map((x, j) => (j === i ? updated : x)))}
                      onRemove={() => setPlanTasks((arr) => arr.filter((_, j) => j !== i))}
                      users={nonPublicUsers}
                      colors={colors}
                    />
                  ))}
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">VERIFICATION METHOD</Text>
                  <TextInput
                    style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={planVerifMethod}
                    onChangeText={setPlanVerifMethod}
                    placeholder="How will the improvement be verified?"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={2}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">WHO WILL VERIFY</Text>
                  <Pressable onPress={() => setPlanVerifPickerOpen(true)}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius="$2"
                      padding={10}
                      backgroundColor={colors.background}
                    >
                      <Text
                        color={planVerifId ? colors.text : colors.textMuted}
                        fontSize="$3"
                      >
                        {planVerifId ? displayName(planVerifId) : 'Select verifier…'}
                      </Text>
                    </XStack>
                  </Pressable>
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">REVIEW DATE</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={planReviewDate}
                    onChangeText={setPlanReviewDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <Pressable
                  onPress={handleSavePlan}
                  disabled={savingPlan || !planDesc.trim() || !planVerifMethod.trim() || !planVerifId || !planReviewDate}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={savingPlan || !planDesc.trim() || !planVerifMethod.trim() || !planVerifId || !planReviewDate ? 0.5 : 1}
                    marginBottom="$2"
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {savingPlan ? 'Saving and assigning tasks…' : 'Save Action Plan & Move to Implementation'}
                    </Text>
                  </XStack>
                </Pressable>

              </YStack>
            </ScrollView>
          </YStack>
        </View>
      </Modal>

      {/* Verifier picker (inside action plan modal) */}
      <UserPickerModal
        visible={planVerifPickerOpen}
        onClose={() => setPlanVerifPickerOpen(false)}
        onSelect={setPlanVerifId}
        users={nonPublicUsers}
        selectedUid={planVerifId}
        colors={colors}
      />

      {/* Delete Modal */}
      <Modal
        visible={!!deleteTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$5"
            gap="$3"
            width="90%"
            maxWidth={480}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">Delete Card</Text>
              <Pressable onPress={() => setDeleteTarget(null)}>
                <Text color={colors.textMuted} fontSize="$4">✕</Text>
              </Pressable>
            </XStack>

            {deleteTarget ? (
              <Text color={colors.textMuted} fontSize="$3">
                Deleting "{deleteTarget.title}". The creator
                {deleteTarget.upvotes.length > 0
                  ? ` and ${deleteTarget.upvotes.length} upvoter${deleteTarget.upvotes.length !== 1 ? 's' : ''}`
                  : ''}{' '}
                will be notified.
              </Text>
            ) : null}

            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">REASON FOR DELETION</Text>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={deleteReason}
                onChangeText={setDeleteReason}
                placeholder="Explain why this card is being deleted…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </YStack>

            <XStack gap="$2" justifyContent="flex-end">
              <Pressable onPress={() => setDeleteTarget(null)}>
                <XStack
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                >
                  <Text color={colors.text} fontWeight="600" fontSize="$3">Cancel</Text>
                </XStack>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleting || !deleteReason.trim()}
              >
                <XStack
                  backgroundColor="#c0392b"
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  opacity={deleting || !deleteReason.trim() ? 0.5 : 1}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {deleting ? 'Deleting…' : 'Delete & Notify'}
                  </Text>
                </XStack>
              </Pressable>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </YStack>
  )
}

const styles = StyleSheet.create({
  fab: {
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
  },
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
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
})
