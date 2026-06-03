import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, View, Modal, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useRouter } from 'expo-router'
import { usePostsStore } from '@/stores/postsStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import type { PostPage } from '@/types/events'

function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type EditState = {
  id: string
  label: string
  bgImage: string
  fbPageId: string
  fbToken: string
  desc: string
  isNew: boolean
}

function blankEdit(partial?: Partial<PostPage>): EditState {
  return {
    id: partial?.id ?? nanoid(),
    label: partial?.label ?? '',
    bgImage: partial?.bgImage ?? '',
    fbPageId: partial?.fbPageId ?? '',
    fbToken: partial?.fbToken ?? '',
    desc: partial?.desc ?? '',
    isNew: !partial?.id,
  }
}

export default function PostsIndex() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)
  const postsStore = usePostsStore()

  const [buildMode, setBuildMode] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    postsStore.refreshConfig().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { pages } = postsStore.config

  const PADDING = 16
  const GAP = 10

  const openEdit = (page?: PostPage) => {
    setConfirmDelete(false)
    setEditState(blankEdit(page))
  }

  const handleSave = async () => {
    if (!editState || !editState.label.trim()) {
      toast('Page name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const patch: Partial<PostPage> = {
        label: editState.label.trim(),
        bgImage: editState.bgImage.trim() || undefined,
        fbPageId: editState.fbPageId.trim() || undefined,
        fbToken: editState.fbToken.trim() || undefined,
        desc: editState.desc.trim() || undefined,
      }
      if (editState.isNew) {
        await postsStore.addPage({ ...patch, id: editState.id, label: patch.label!, posts: [] })
      } else {
        await postsStore.updatePage(editState.id, patch)
      }
      toast(editState.isNew ? 'Page added' : 'Page updated', 'success')
      setEditState(null)
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editState) return
    setSaving(true)
    try {
      await postsStore.deletePage(editState.id)
      toast('Page removed', 'info')
      setEditState(null)
      setConfirmDelete(false)
    } catch {
      toast('Failed to remove', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCardPress = (page: PostPage) => {
    if (buildMode) {
      openEdit(page)
    } else {
      router.push(`/posts/${page.id}` as never)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      {/* Admin build-mode toggle — inline since the layout uses a custom header */}
      {admin ? (
        <XStack
          justifyContent="flex-end"
          paddingHorizontal={PADDING}
          paddingTop={10}
          paddingBottom={0}
        >
          <Pressable onPress={() => setBuildMode((v) => !v)}>
            <XStack
              paddingHorizontal={10}
              paddingVertical={5}
              borderRadius={6}
              backgroundColor={buildMode ? colors.primary : 'transparent'}
              borderWidth={1}
              borderColor={buildMode ? colors.primary : colors.border}
            >
              <Text
                color={buildMode ? 'white' : colors.text}
                fontSize={12}
                fontWeight="600"
              >
                {buildMode ? '✓ Done' : '⚙ Build'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}

      <ScrollView style={{ flex: 1 }}>
        <YStack padding={PADDING} gap={GAP}>
          {pages.length === 0 && !buildMode ? (
            <YStack alignItems="center" justifyContent="center" padding="$6" gap="$3">
              <Text fontSize={32}>📰</Text>
              <Text color={colors.text} fontWeight="700" fontSize="$5" textAlign="center">
                No pages yet
              </Text>
              <Text color={colors.textMuted} textAlign="center" fontSize="$3">
                {admin
                  ? 'Tap ⚙ Build above to add your first Facebook page.'
                  : 'Check back soon for updates.'}
              </Text>
            </YStack>
          ) : null}

          <YStack gap={GAP}>
            {pages.map((page) => (
              <Pressable key={page.id} onPress={() => handleCardPress(page)}>
                <View style={[styles.pill, buildMode && styles.pillBuildMode, { borderColor: colors.border }]}>
                  {/* Left: photo panel */}
                  <View style={styles.pillLeft}>
                    {page.bgImage ? (
                      <img src={page.bgImage} alt="" style={styles.pillImg as object} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary + '77' }]} />
                    )}
                  </View>

                  {/* Right: text panel */}
                  <View style={[styles.pillRight, { backgroundColor: colors.surface }]}>
                    <Text color={colors.text} fontWeight="700" fontSize={15} numberOfLines={1}>
                      {page.label}
                    </Text>
                    {page.desc ? (
                      <Text color={colors.textMuted} fontSize={12} numberOfLines={1} marginTop={2}>
                        {page.desc}
                      </Text>
                    ) : null}
                    {!page.fbPageId && admin ? (
                      <Text style={{ color: 'rgba(255,160,30,1)', fontSize: 10, fontWeight: '600', marginTop: 3 }}>
                        ⚠ Facebook page not linked
                      </Text>
                    ) : null}
                    {page.fbPageId && !buildMode ? (
                      <XStack gap={4} alignItems="center" marginTop={3}>
                        <View style={styles.fbBadge}>
                          <Text color="white" fontSize={9} fontWeight="700">f</Text>
                        </View>
                        <Text color={colors.textMuted} fontSize={10}>Facebook linked</Text>
                      </XStack>
                    ) : null}
                  </View>

                  {/* Build mode edit overlay */}
                  {buildMode ? (
                    <View style={styles.buildOverlay}>
                      <View style={styles.editChip}>
                        <Text color={colors.primary} fontSize={12} fontWeight="700">✎ Edit</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}

            {/* Add page pill — build mode only */}
            {buildMode ? (
              <Pressable onPress={() => openEdit()}>
                <XStack
                  style={[styles.pill, { borderColor: colors.primary, backgroundColor: colors.surface, borderStyle: 'dashed', borderWidth: 2 }]}
                  alignItems="center"
                  justifyContent="center"
                  gap={8}
                >
                  <Text color={colors.primary} fontSize={22} fontWeight="300">+</Text>
                  <Text color={colors.primary} fontSize={14} fontWeight="600">Add Page</Text>
                </XStack>
              </Pressable>
            ) : null}
          </YStack>
        </YStack>
      </ScrollView>

      {/* Edit / Add Page Modal */}
      <Modal
        visible={!!editState}
        animationType="slide"
        transparent
        onRequestClose={() => setEditState(null)}
      >
        <View style={styles.overlay}>
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
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {editState?.isNew ? 'Add Page' : 'Edit Page'}
              </Text>
              <Pressable onPress={() => setEditState(null)}>
                <Text color={colors.textMuted} fontSize="$4">✕</Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$3">
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    PAGE NAME *
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={editState?.label ?? ''}
                    onChangeText={(v) => setEditState((s) => s ? { ...s, label: v } : s)}
                    placeholder="e.g. Elim Church"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    BACKGROUND IMAGE URL
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={editState?.bgImage ?? ''}
                    onChangeText={(v) => setEditState((s) => s ? { ...s, bgImage: v } : s)}
                    placeholder="https://..."
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    DESCRIPTION (optional)
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={editState?.desc ?? ''}
                    onChangeText={(v) => setEditState((s) => s ? { ...s, desc: v } : s)}
                    placeholder="e.g. News & announcements"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <YStack
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius="$3"
                  padding="$3"
                  gap="$3"
                  backgroundColor={colors.background}
                >
                  <XStack gap="$2" alignItems="center">
                    <View style={[styles.fbBadge, { position: 'relative', top: 0, right: 0 }]}>
                      <Text color="white" fontSize={11} fontWeight="700">f</Text>
                    </View>
                    <Text color={colors.text} fontWeight="700" fontSize="$3">
                      Facebook Integration
                    </Text>
                  </XStack>
                  <Text color={colors.textMuted} fontSize={12} lineHeight={18}>
                    After Facebook app approval, add your Page ID and token here. Zapier will automatically
                    sync new posts using the Page ID as the Firestore path.
                  </Text>

                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      FACEBOOK PAGE ID / USERNAME
                    </Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                      value={editState?.fbPageId ?? ''}
                      onChangeText={(v) => setEditState((s) => s ? { ...s, fbPageId: v } : s)}
                      placeholder="e.g. ElimFresno or 123456789"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                    />
                  </YStack>

                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      PAGE ACCESS TOKEN
                    </Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                      value={editState?.fbToken ?? ''}
                      onChangeText={(v) => setEditState((s) => s ? { ...s, fbToken: v } : s)}
                      placeholder="From Meta Business Suite → Integrations → Access Tokens"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      secureTextEntry
                    />
                  </YStack>
                </YStack>

                <Pressable onPress={handleSave} disabled={saving || !editState?.label.trim()}>
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={saving || !editState?.label.trim() ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {saving ? 'Saving…' : editState?.isNew ? 'Add Page' : 'Save Changes'}
                    </Text>
                  </XStack>
                </Pressable>

                {!editState?.isNew ? (
                  confirmDelete ? (
                    <YStack gap="$2">
                      <Text color="#c0392b" fontSize="$3" textAlign="center">
                        {'Remove "'}{editState?.label}{'" — this cannot be undone.'}
                      </Text>
                      <XStack gap="$2">
                        <Pressable onPress={() => setConfirmDelete(false)} style={{ flex: 1 }}>
                          <XStack
                            borderWidth={1}
                            borderColor={colors.border}
                            borderRadius="$2"
                            paddingVertical="$2"
                            justifyContent="center"
                          >
                            <Text color={colors.textMuted} fontSize="$3">Cancel</Text>
                          </XStack>
                        </Pressable>
                        <Pressable onPress={handleDelete} disabled={saving} style={{ flex: 1 }}>
                          <XStack
                            backgroundColor="#c0392b"
                            borderRadius="$2"
                            paddingVertical="$2"
                            justifyContent="center"
                            opacity={saving ? 0.5 : 1}
                          >
                            <Text color="white" fontWeight="700" fontSize="$3">
                              Remove
                            </Text>
                          </XStack>
                        </Pressable>
                      </XStack>
                    </YStack>
                  ) : (
                    <Pressable onPress={() => setConfirmDelete(true)}>
                      <XStack justifyContent="center" paddingVertical="$2">
                        <Text color="#c0392b" fontSize="$3">
                          Remove this page
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                ) : null}
              </YStack>
            </ScrollView>
          </YStack>
        </View>
      </Modal>
    </YStack>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    overflow: 'hidden',
    height: 82,
    flexDirection: 'row',
    borderWidth: 1,
  },
  pillBuildMode: {
    opacity: 0.8,
  },
  pillLeft: {
    width: 110,
    height: 82,
    overflow: 'hidden',
    position: 'relative',
  },
  pillImg: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%' as const,
    height: '100%' as const,
    objectFit: 'cover' as const,
  },
  pillRight: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  fbBadge: {
    backgroundColor: '#1877F2',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  buildOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editChip: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
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
})
