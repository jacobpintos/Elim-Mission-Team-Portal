import { useState, useEffect, useMemo } from 'react'
import { ScrollView, Pressable, TextInput, Modal, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useIssuesStore } from '@/stores/issuesStore'
import { useUsersStore } from '@/stores/usersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import type { IssueCategory, IssueStatus } from '@/types/operations'

const CATEGORY_COLORS: Record<IssueCategory, string> = {
  equipment: '#e67e22',
  safety: '#c0392b',
  facility: '#2980b9',
  logistics: '#8e44ad',
  other: '#7f8c8d',
}

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  equipment: 'Equipment',
  safety: 'Safety',
  facility: 'Facility',
  logistics: 'Logistics',
  other: 'Other',
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  pending_review: 'Pending Review',
  root_cause_identified: "Root Cause ID'd",
  actions_assigned: 'Actions Assigned',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_COLORS: Record<IssueStatus, string> = {
  pending_review: '#e67e22',
  root_cause_identified: '#f39c12',
  actions_assigned: '#2980b9',
  resolved: '#27ae60',
  closed: '#7f8c8d',
}

const WHY_LABELS = [
  'Why did this happen?',
  'Why did that cause it?',
  'Why did that cause it?',
  'Why did that cause it?',
  'Why did that cause it?',
]

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <XStack borderBottomWidth={1} borderBottomColor={colors.border} paddingBottom="$2" marginBottom="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="700" letterSpacing={1}>
        {title.toUpperCase()}
      </Text>
    </XStack>
  )
}

export default function IssueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)

  const { issues, subscribe, unsubscribe, saveRootCause, addCorrectiveAction, updateStatus } = useIssuesStore()
  const { users } = useUsersStore()
  const { tasks } = useTasksStore()

  const [localWhys, setLocalWhys] = useState<string[] | null>(null)
  const [localRootCause, setLocalRootCause] = useState<string | null>(null)
  const [savingWhys, setSavingWhys] = useState(false)

  const [caDesc, setCaDesc] = useState('')
  const [caAssignee, setCaAssignee] = useState('')
  const [caDueDate, setCaDueDate] = useState('')
  const [addingCA, setAddingCA] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const issue = issues.find((i) => String(i.id) === String(id))

  const issueWhys = useMemo(() => {
    const padded = [...(issue?.whys ?? [])]
    while (padded.length < 5) padded.push('')
    return padded.slice(0, 5)
  }, [issue?.whys])

  const whys = localWhys ?? issueWhys
  const rootCause = localRootCause ?? (issue?.rootCause ?? '')

  const displayName = (uid: string | number) => {
    const u = users.find((x) => String(x.uid) === String(uid))
    return u?.displayName ?? String(uid)
  }

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))

  const handleSaveRootCause = async () => {
    if (!rootCause.trim()) return
    setSavingWhys(true)
    try {
      await saveRootCause(issue!.id, whys, rootCause.trim(), uid)
      setLocalWhys(null)
      setLocalRootCause(null)
      toast('Root cause saved', 'success')
    } catch {
      toast('Failed to save root cause', 'error')
    } finally {
      setSavingWhys(false)
    }
  }

  const handleAddCA = async () => {
    if (!caDesc.trim() || !caAssignee || !caDueDate) return
    setAddingCA(true)
    try {
      await addCorrectiveAction(
        issue!.id,
        { description: caDesc.trim(), assignee: caAssignee, dueDate: caDueDate },
        uid
      )
      toast('Corrective action added and task assigned', 'success')
      setCaDesc('')
      setCaAssignee('')
      setCaDueDate('')
    } catch {
      toast('Failed to add corrective action', 'error')
    } finally {
      setAddingCA(false)
    }
  }

  const handleUpdateStatus = async (status: IssueStatus) => {
    try {
      await updateStatus(issue!.id, status)
      toast('Status updated', 'success')
    } catch {
      toast('Failed to update status', 'error')
    }
  }

  if (!issue) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center" backgroundColor={colors.background}>
        <Stack.Screen options={{ title: 'Issue Detail' }} />
        <Text color={colors.textMuted}>Issue not found.</Text>
      </YStack>
    )
  }

  const selectedUser = nonPublicUsers.find((u) => String(u.uid) === caAssignee)

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: `Issue #${issue.id}` }} />

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$4" gap="$4">

          {/* Issue header */}
          <YStack gap="$2">
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
              <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
                {issue.title}
              </Text>
              <XStack
                backgroundColor={STATUS_COLORS[issue.status]}
                borderRadius={99}
                paddingHorizontal={10}
                paddingVertical={3}
              >
                <Text color="white" fontSize={11} fontWeight="600">
                  {STATUS_LABELS[issue.status]}
                </Text>
              </XStack>
            </XStack>
            <XStack gap="$2" alignItems="center" flexWrap="wrap">
              <XStack
                backgroundColor={CATEGORY_COLORS[issue.category]}
                borderRadius={99}
                paddingHorizontal={8}
                paddingVertical={2}
              >
                <Text color="white" fontSize={10} fontWeight="600">
                  {CATEGORY_LABELS[issue.category]}
                </Text>
              </XStack>
              <Text color={colors.textMuted} fontSize="$2">
                Reported by {displayName(issue.reportedBy)}
              </Text>
            </XStack>
          </YStack>

          {/* Description */}
          <YStack gap="$2">
            <SectionHeader title="Description" colors={colors} />
            <Text color={colors.text} fontSize="$3">{issue.description}</Text>
          </YStack>

          {/* Suggested action */}
          {issue.suggestedAction ? (
            <YStack gap="$2">
              <SectionHeader title="Suggested Action" colors={colors} />
              <Text color={colors.text} fontSize="$3">{issue.suggestedAction}</Text>
            </YStack>
          ) : null}

          {/* 5 Whys — admin only */}
          {admin ? (
            <YStack gap="$2">
              <SectionHeader title="5 Whys Analysis" colors={colors} />
              {WHY_LABELS.map((label, i) => (
                <YStack key={i} gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    WHY {i + 1}{i === 0 ? '' : ` — ${label}`}
                    {i === 0 ? ` — ${label}` : ''}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={whys[i]}
                    onChangeText={(v) => setLocalWhys((w) => (w ?? issueWhys).map((x, j) => (j === i ? v : x)))}
                    placeholder={`Why ${i + 1}…`}
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>
              ))}

              <YStack gap="$1" marginTop="$2">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">ROOT CAUSE SUMMARY</Text>
                <TextInput
                  style={[
                    styles.textarea,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                  value={rootCause}
                  onChangeText={setLocalRootCause}
                  placeholder="State the root cause identified through the 5 Whys analysis"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </YStack>

              <Pressable onPress={handleSaveRootCause} disabled={savingWhys || !rootCause.trim()}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingVertical="$2"
                  paddingHorizontal="$4"
                  justifyContent="center"
                  opacity={savingWhys || !rootCause.trim() ? 0.5 : 1}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {savingWhys ? 'Saving…' : 'Save Root Cause'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : issue.rootCause ? (
            <YStack gap="$2">
              <SectionHeader title="Root Cause" colors={colors} />
              {issue.whys.filter((w) => w.trim()).map((w, i) => (
                <XStack key={i} gap="$2">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="700">Why {i + 1}:</Text>
                  <Text color={colors.text} fontSize="$2" flex={1}>{w}</Text>
                </XStack>
              ))}
              <XStack gap="$2" marginTop="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="700">Root cause:</Text>
                <Text color={colors.text} fontSize="$2" flex={1}>{issue.rootCause}</Text>
              </XStack>
            </YStack>
          ) : null}

          {/* Corrective Actions */}
          <YStack gap="$2">
            <SectionHeader title="Corrective Actions" colors={colors} />
            {issue.correctiveActions?.length ? (
              issue.correctiveActions.map((ca) => {
                const linkedTask = tasks.find((t) => String(t.id) === String(ca.taskId))
                return (
                  <YStack
                    key={ca.id}
                    backgroundColor={colors.surface}
                    borderRadius="$2"
                    padding="$3"
                    gap="$1"
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    <Text color={colors.text} fontSize="$3" fontWeight="600">{ca.description}</Text>
                    <XStack gap="$3" flexWrap="wrap">
                      <Text color={colors.textMuted} fontSize="$2">
                        Assigned to {displayName(ca.assignee)}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        Due {FD(ca.dueDate)}
                      </Text>
                      {linkedTask ? (
                        <XStack
                          backgroundColor={linkedTask.status === 'done' ? '#27ae60' : '#2980b9'}
                          borderRadius={99}
                          paddingHorizontal={6}
                          paddingVertical={1}
                        >
                          <Text color="white" fontSize={10} fontWeight="600">
                            {linkedTask.status === 'done' ? '✓ Done' : 'In Progress'}
                          </Text>
                        </XStack>
                      ) : null}
                    </XStack>
                  </YStack>
                )
              })
            ) : (
              <Text color={colors.textMuted} fontSize="$2">No corrective actions yet.</Text>
            )}

            {/* Add corrective action — admin only */}
            {admin && issue.status !== 'resolved' && issue.status !== 'closed' ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                gap="$2"
                borderWidth={1}
                borderColor={colors.border}
                marginTop="$2"
              >
                <Text color={colors.text} fontSize="$3" fontWeight="700">Add Corrective Action</Text>

                <TextInput
                  style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={caDesc}
                  onChangeText={setCaDesc}
                  placeholder="Describe the corrective action"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                />

                <Pressable onPress={() => setPickerOpen(true)}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.border}
                    borderRadius="$2"
                    padding="$2"
                    backgroundColor={colors.background}
                  >
                    <Text color={selectedUser ? colors.text : colors.textMuted} fontSize="$3">
                      {selectedUser ? selectedUser.displayName : 'Select assignee…'}
                    </Text>
                  </XStack>
                </Pressable>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">DUE DATE</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={caDueDate}
                    onChangeText={setCaDueDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <Pressable
                  onPress={handleAddCA}
                  disabled={addingCA || !caDesc.trim() || !caAssignee || !caDueDate}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$2"
                    justifyContent="center"
                    opacity={addingCA || !caDesc.trim() || !caAssignee || !caDueDate ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {addingCA ? 'Adding…' : 'Add Action & Assign Task'}
                    </Text>
                  </XStack>
                </Pressable>
              </YStack>
            ) : null}
          </YStack>

          {/* Status controls — admin only */}
          {admin ? (
            <YStack gap="$2">
              <SectionHeader title="Status" colors={colors} />
              <XStack gap="$2" flexWrap="wrap">
                {issue.status !== 'resolved' ? (
                  <Pressable onPress={() => handleUpdateStatus('resolved')}>
                    <XStack
                      backgroundColor="#27ae60"
                      borderRadius="$2"
                      paddingHorizontal="$4"
                      paddingVertical="$2"
                    >
                      <Text color="white" fontWeight="700" fontSize="$3">Mark Resolved</Text>
                    </XStack>
                  </Pressable>
                ) : null}
                {issue.status !== 'closed' ? (
                  <Pressable onPress={() => handleUpdateStatus('closed')}>
                    <XStack
                      backgroundColor={colors.textMuted}
                      borderRadius="$2"
                      paddingHorizontal="$4"
                      paddingVertical="$2"
                    >
                      <Text color="white" fontWeight="700" fontSize="$3">Close Issue</Text>
                    </XStack>
                  </Pressable>
                ) : null}
                {(issue.status === 'resolved' || issue.status === 'closed') ? (
                  <Pressable onPress={() => handleUpdateStatus('pending_review')}>
                    <XStack
                      borderRadius="$2"
                      paddingHorizontal="$4"
                      paddingVertical="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <Text color={colors.text} fontWeight="600" fontSize="$3">Reopen</Text>
                    </XStack>
                  </Pressable>
                ) : null}
              </XStack>
            </YStack>
          ) : null}

        </YStack>
      </ScrollView>

      {/* Assignee picker modal */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
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
              <Text color={colors.text} fontSize="$4" fontWeight="700">Select Assignee</Text>
              <Pressable onPress={() => setPickerOpen(false)}>
                <Text color={colors.textMuted} fontSize="$4">✕</Text>
              </Pressable>
            </XStack>
            <ScrollView>
              {nonPublicUsers.map((u) => (
                <Pressable
                  key={String(u.uid)}
                  onPress={() => { setCaAssignee(String(u.uid)); setPickerOpen(false) }}
                >
                  <XStack
                    paddingVertical="$3"
                    paddingHorizontal="$2"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                    backgroundColor={String(u.uid) === caAssignee ? colors.primary + '22' : 'transparent'}
                  >
                    <Text color={colors.text} fontSize="$3">{u.displayName}</Text>
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </YStack>
        </View>
      </Modal>
    </YStack>
  )
}

const styles = StyleSheet.create({
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
