import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, Modal, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useIssuesStore } from '@/stores/issuesStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isPublic } from '@/lib/roles'
import type { IssueCategory, IssueStatus } from '@/types/operations'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

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
  closed: 'Resolved',
}

const STATUS_COLORS: Record<IssueStatus, string> = {
  pending_review: '#e67e22',
  root_cause_identified: '#f39c12',
  actions_assigned: '#2980b9',
  resolved: '#27ae60',
  closed: '#27ae60',
}

const CATEGORIES: IssueCategory[] = ['equipment', 'safety', 'facility', 'logistics', 'other']

type FilterKey = 'all' | IssueStatus

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'root_cause_identified', label: 'Root Cause' },
  { key: 'actions_assigned', label: 'Actions' },
  { key: 'resolved', label: 'Resolved' },
]

export default function IssuesIndex() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const router = useRouter()
  const toast = useUIStore((s) => s.toast)

  const { issues, subscribe, unsubscribe, createIssue } = useIssuesStore()
  const { users } = useUsersStore()

  const [filter, setFilter] = useState<FilterKey>('all')
  const [reportOpen, setReportOpen] = useState(false)
  const [rTitle, setRTitle] = useState('')
  const [rCategory, setRCategory] = useState<IssueCategory>('equipment')
  const [rDescription, setRDescription] = useState('')
  const [rSuggested, setRSuggested] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displayName = (id: string | number) => {
    const u = users.find((x) => String(x.uid) === String(id))
    return u?.displayName ?? String(id)
  }

  const filtered = issues
    .filter((i) => {
      if (filter === 'all') return true
      if (filter === 'resolved') return i.status === 'resolved' || i.status === 'closed'
      return i.status === filter
    })
    .sort((a, b) => Number(b.id) - Number(a.id))

  const handleSubmitReport = async () => {
    if (!rTitle.trim() || !rDescription.trim()) return
    setSubmitting(true)
    try {
      await createIssue({
        title: rTitle.trim(),
        description: rDescription.trim(),
        category: rCategory,
        suggestedAction: rSuggested.trim(),
        reportedBy: uid,
      })
      toast('Issue reported successfully', 'success')
      setReportOpen(false)
      setRTitle('')
      setRCategory('equipment')
      setRDescription('')
      setRSuggested('')
    } catch {
      toast('Failed to submit report', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Operations' }} />

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        <XStack>
          {FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)}>
              <XStack
                paddingHorizontal={14}
                paddingVertical={12}
                borderBottomWidth={filter === f.key ? 2 : 0}
                borderBottomColor={filter === f.key ? colors.primary : 'transparent'}
              >
                <Text
                  fontSize="$3"
                  fontWeight={filter === f.key ? '700' : '400'}
                  color={filter === f.key ? colors.text : colors.textMuted}
                >
                  {f.label}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>
      </ScrollView>

      {/* Issue list */}
      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {filtered.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$4"
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text color={colors.textMuted}>No issues found.</Text>
            </YStack>
          ) : (
            filtered.map((issue) => (
              <Pressable
                key={String(issue.id)}
                onPress={() => router.push(`/(app)/issues/${issue.id}` as never)}
              >
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  padding="$3"
                  gap="$2"
                  borderWidth={1}
                  borderColor={colors.border}
                >
                  <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                    <Text color={colors.text} fontWeight="700" fontSize="$4" flex={1}>
                      {issue.title}
                    </Text>
                    <XStack
                      backgroundColor={STATUS_COLORS[issue.status]}
                      borderRadius={99}
                      paddingHorizontal={8}
                      paddingVertical={2}
                    >
                      <Text color="white" fontSize={10} fontWeight="600">
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
                  {issue.description ? (
                    <Text color={colors.textMuted} fontSize="$2" numberOfLines={2}>
                      {issue.description}
                    </Text>
                  ) : null}
                  {issue.correctiveActions?.length ? (
                    <Text color={colors.textMuted} fontSize="$2">
                      {issue.correctiveActions.length} corrective action
                      {issue.correctiveActions.length !== 1 ? 's' : ''}
                    </Text>
                  ) : null}
                </YStack>
              </Pressable>
            ))
          )}
        </YStack>
      </ScrollView>

      {/* Report FAB */}
      {!isPublic(profile) ? (
        <Pressable
          onPress={() => setReportOpen(true)}
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$3">
            ⊕ Report Issue
          </Text>
        </Pressable>
      ) : null}

      {/* Report Modal */}
      <Modal
        visible={reportOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setReportOpen(false)}
      >
        <View style={styles.overlay}>
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
                Report an Issue
              </Text>
              <Pressable onPress={() => setReportOpen(false)}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView>
              <YStack gap="$3">
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    ISSUE TITLE
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={rTitle}
                    onChangeText={setRTitle}
                    placeholder="Brief title describing the issue"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    CATEGORY
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {CATEGORIES.map((cat) => (
                      <Pressable key={cat} onPress={() => setRCategory(cat)}>
                        <XStack
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                          borderRadius={99}
                          backgroundColor={rCategory === cat ? CATEGORY_COLORS[cat] : 'transparent'}
                          borderWidth={1}
                          borderColor={CATEGORY_COLORS[cat]}
                          marginBottom="$1"
                        >
                          <Text
                            color={rCategory === cat ? 'white' : CATEGORY_COLORS[cat]}
                            fontSize="$2"
                            fontWeight="600"
                          >
                            {CATEGORY_LABELS[cat]}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    DESCRIPTION
                  </Text>
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={rDescription}
                    onChangeText={setRDescription}
                    placeholder="Describe the issue in detail"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={4}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    SUGGESTED ACTION{' '}
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="400">
                      (optional)
                    </Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={rSuggested}
                    onChangeText={setRSuggested}
                    placeholder="What do you think should be done?"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </YStack>

                <Pressable
                  onPress={handleSubmitReport}
                  disabled={submitting || !rTitle.trim() || !rDescription.trim()}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={submitting || !rTitle.trim() || !rDescription.trim() ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {submitting ? 'Submitting…' : 'Submit Report'}
                    </Text>
                  </XStack>
                </Pressable>
              </YStack>
            </ScrollView>
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
})
