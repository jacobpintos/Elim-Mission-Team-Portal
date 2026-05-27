/**
 * Phase 3 Posts — Facebook link aggregator
 *
 * Replaces the Phase 2 social-post screen.
 * Data lives in config/main as postsConfig + lastSeenPosts.
 */
import { useEffect, useState } from 'react'
import { ScrollView, TextInput, StyleSheet, Pressable, Linking, Alert } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { usePostsStore } from '@/stores/postsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import type { PostPage, Post } from '@/types/posts'

// ── Date formatter ─────────────────────────────────────────────────────────────

function FD(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Page Selector Button ───────────────────────────────────────────────────────

function PageButton({
  page,
  active,
  unseen,
  onPress,
}: {
  page: PostPage
  active: boolean
  unseen: boolean
  onPress: () => void
}) {
  const colors = useThemeColors()
  return (
    <Pressable onPress={onPress}>
      <YStack
        width={110}
        borderRadius={10}
        overflow="hidden"
        borderWidth={2}
        borderColor={active ? colors.primary : colors.border}
        position="relative"
      >
        {/* Background image or fallback */}
        {page.bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.bgImage}
            alt={page.label}
            style={{ width: '100%', height: 60, objectFit: 'cover' }}
          />
        ) : (
          <YStack
            height={60}
            backgroundColor={active ? colors.primary + '40' : colors.surface}
            justifyContent="center"
            alignItems="center"
          >
            <Text style={{ fontSize: 24 }}>📌</Text>
          </YStack>
        )}

        {/* Label */}
        <YStack
          paddingHorizontal={6}
          paddingVertical={4}
          backgroundColor={active ? colors.primary : colors.surface}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: active ? '#fff' : (colors.text as string),
              textAlign: 'center',
            }}
            numberOfLines={1}
          >
            {page.label}
          </Text>
        </YStack>

        {/* Unseen dot */}
        {unseen && !active && (
          <YStack
            position="absolute"
            top={4}
            right={4}
            width={10}
            height={10}
            borderRadius={5}
            backgroundColor={colors.primary}
            borderWidth={1.5}
            borderColor="#fff"
          />
        )}
      </YStack>
    </Pressable>
  )
}

// ── Post Card ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  page,
  isLatest,
  admin,
  buildMode,
  onDelete,
}: {
  post: Post
  page: PostPage
  isLatest: boolean
  admin: boolean
  buildMode: boolean
  onDelete: () => void
}) {
  const colors = useThemeColors()

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius={10}
      borderWidth={1}
      borderColor={colors.border}
      overflow="hidden"
    >
      {/* Author row */}
      <XStack padding={12} gap={10} alignItems="center">
        {page.bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.bgImage}
            alt={page.label}
            style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover' }}
          />
        ) : (
          <YStack
            width={36}
            height={36}
            borderRadius={18}
            backgroundColor={colors.primary + '30'}
            justifyContent="center"
            alignItems="center"
          >
            <Text style={{ fontSize: 16, color: colors.primary as string }}>
              {page.label.charAt(0).toUpperCase()}
            </Text>
          </YStack>
        )}

        <YStack flex={1}>
          <XStack alignItems="center" gap={6}>
            <Text style={{ fontWeight: '700', color: colors.text as string, fontSize: 14 }}>
              {page.label}
            </Text>
            {isLatest && (
              <YStack paddingHorizontal={6} paddingVertical={2} borderRadius={4} backgroundColor={colors.primary}>
                <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>· Latest</Text>
              </YStack>
            )}
          </XStack>
          <Text style={{ fontSize: 12, color: colors.textMuted as string }}>{FD(post.date)}</Text>
        </YStack>

        {admin && buildMode && (
          <Pressable onPress={onDelete}>
            <Text style={{ color: '#c0392b', fontSize: 18 }}>✕</Text>
          </Pressable>
        )}
      </XStack>

      <YStack paddingHorizontal={12} paddingBottom={12} gap={6}>
        {post.title && (
          <Text style={{ fontWeight: '700', color: colors.text as string, fontSize: 15 }}>
            {post.title}
          </Text>
        )}
        {post.note && (
          <Text style={{ color: colors.text as string, fontSize: 13, lineHeight: 20 }}>
            {post.note}
          </Text>
        )}

        {/* View on Facebook */}
        <Pressable onPress={() => Linking.openURL(post.url).catch(() => {})}>
          <XStack
            marginTop={8}
            paddingHorizontal={14}
            paddingVertical={9}
            borderRadius={8}
            backgroundColor="#1877F2"
            alignSelf="flex-start"
            gap={6}
            alignItems="center"
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              View on Facebook ↗
            </Text>
          </XStack>
        </Pressable>

        <Text style={{ fontSize: 11, color: colors.textMuted as string, fontStyle: 'italic', marginTop: 2 }}>
          Full post with likes and comments on Facebook
        </Text>
      </YStack>
    </YStack>
  )
}

// ── Build Mode: Page Editor ────────────────────────────────────────────────────

function PageEditor({ page }: { page: PostPage }) {
  const colors = useThemeColors()
  const store = usePostsStore()
  const [label, setLabel] = useState(page.label)
  const [bgImage, setBgImage] = useState(page.bgImage ?? '')
  const [desc, setDesc] = useState(page.desc ?? '')
  const [fbUrl, setFbUrl] = useState(page.fbUrl ?? '')
  const [saving, setSaving] = useState(false)

  // Add post state
  const [addDate, setAddDate] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addTitle, setAddTitle] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addingSaving, setAddingSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await store.updatePage(page.id, {
        label: label.trim() || page.label,
        bgImage: bgImage.trim() || undefined,
        desc: desc.trim() || undefined,
        fbUrl: fbUrl.trim() || undefined,
      })
    } catch {
      Alert.alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleAddPost = async () => {
    const trimUrl = addUrl.trim()
    if (!addDate) return Alert.alert('Date required')
    if (!trimUrl) return Alert.alert('Facebook post URL required')
    setAddingSaving(true)
    try {
      await store.addPost(page.id, {
        date: addDate,
        url: trimUrl,
        title: addTitle.trim() || undefined,
        note: addNote.trim() || undefined,
      })
      setAddDate('')
      setAddUrl('')
      setAddTitle('')
      setAddNote('')
    } catch {
      Alert.alert('Failed to add post')
    } finally {
      setAddingSaving(false)
    }
  }

  const handleDeletePage = () => {
    Alert.alert('Delete Page', `Delete "${page.label}" and all its posts?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => store.deletePage(page.id) },
    ])
  }

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius={10}
      padding={14}
      borderWidth={1}
      borderColor={colors.border}
      gap={12}
    >
      <Text style={{ fontWeight: '700', color: colors.text as string, fontSize: 15 }}>
        Page: {page.label}
      </Text>

      {/* Page settings */}
      <YStack gap={8}>
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={label}
          onChangeText={setLabel}
          placeholder="Page Label"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={bgImage}
          onChangeText={setBgImage}
          placeholder="Background Image URL"
          keyboardType="url"
          autoCapitalize="none"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={fbUrl}
          onChangeText={setFbUrl}
          placeholder="Facebook Page URL"
          keyboardType="url"
          autoCapitalize="none"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={desc}
          onChangeText={setDesc}
          placeholder="Description"
          placeholderTextColor={colors.textMuted as string}
        />
        <Pressable onPress={handleSave} disabled={saving}>
          <YStack paddingHorizontal={14} paddingVertical={7} borderRadius={6} backgroundColor={colors.primary as string} alignSelf="flex-start">
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {saving ? 'Saving…' : 'Save Page Settings'}
            </Text>
          </YStack>
        </Pressable>
      </YStack>

      {/* Existing posts */}
      {page.posts.length > 0 && (
        <YStack gap={6}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted as string }}>
            Existing Posts ({page.posts.length})
          </Text>
          {[...page.posts].sort((a, b) => b.date.localeCompare(a.date)).map((post) => (
            <XStack
              key={post.id}
              backgroundColor={colors.background}
              borderRadius={6}
              padding={8}
              borderWidth={1}
              borderColor={colors.border}
              justifyContent="space-between"
              alignItems="center"
            >
              <YStack flex={1}>
                <Text style={{ fontSize: 13, color: colors.text as string }}>
                  {post.date} {post.title ? `— ${post.title}` : ''}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted as string }} numberOfLines={1}>
                  {post.url}
                </Text>
              </YStack>
              <Pressable
                onPress={() => {
                  Alert.alert('Delete post?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => store.deletePost(page.id, post.id) },
                  ])
                }}
              >
                <Text style={{ color: '#c0392b', fontSize: 16, marginLeft: 8 }}>✕</Text>
              </Pressable>
            </XStack>
          ))}
        </YStack>
      )}

      {/* Add post form */}
      <YStack gap={8} paddingTop={8} borderTopWidth={1} borderTopColor={colors.border}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text as string }}>Add Post</Text>
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={addDate}
          onChangeText={setAddDate}
          placeholder="Date (YYYY-MM-DD) *"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={addUrl}
          onChangeText={setAddUrl}
          placeholder="Facebook Post URL *"
          keyboardType="url"
          autoCapitalize="none"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={addTitle}
          onChangeText={setAddTitle}
          placeholder="Title (optional)"
          placeholderTextColor={colors.textMuted as string}
        />
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={addNote}
          onChangeText={setAddNote}
          placeholder="Note / context (optional)"
          placeholderTextColor={colors.textMuted as string}
        />
        <Pressable onPress={handleAddPost} disabled={addingSaving}>
          <YStack paddingHorizontal={14} paddingVertical={7} borderRadius={6} backgroundColor="#1877F2" alignSelf="flex-start">
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {addingSaving ? 'Adding…' : '+ Add Post'}
            </Text>
          </YStack>
        </Pressable>
      </YStack>

      {/* Delete page */}
      <Pressable onPress={handleDeletePage}>
        <YStack paddingHorizontal={14} paddingVertical={7} borderRadius={6} borderWidth={1} borderColor="#c0392b" alignSelf="flex-start">
          <Text style={{ color: '#c0392b', fontWeight: '700', fontSize: 13 }}>Delete Page</Text>
        </YStack>
      </Pressable>
    </YStack>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function PostsScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = (profile?.uid as string) ?? ''
  const admin = isAdmin(profile)

  const store = usePostsStore()
  const { pages, lastSeen, loading } = store

  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [buildMode, setBuildMode] = useState(false)
  const [postIndex, setPostIndex] = useState(0) // current post shown (within sorted list)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Add new page form
  const [addingPage, setAddingPage] = useState(false)
  const [newPageLabel, setNewPageLabel] = useState('')

  useEffect(() => {
    store.loadPosts().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default to first page
  useEffect(() => {
    if (!activePageId && pages.length > 0) {
      setActivePageId(pages[0].id)
    }
  }, [pages, activePageId])

  const activePage = pages.find((p) => p.id === activePageId) ?? null

  // Sorted posts for active page (newest first)
  const sortedPosts: Post[] = activePage
    ? [...activePage.posts].sort((a, b) => b.date.localeCompare(a.date))
    : []

  const hasUnseenForPage = (page: PostPage): boolean => {
    const lastSeenDate = lastSeen[page.id] ?? ''
    return page.posts.some((p) => p.date > lastSeenDate)
  }

  const handleSelectPage = (page: PostPage) => {
    setActivePageId(page.id)
    setPostIndex(0)
    setArchiveOpen(false)
    // Mark as seen using latest post date
    if (page.posts.length > 0) {
      const latestDate = [...page.posts].sort((a, b) => b.date.localeCompare(a.date))[0].date
      store.markPageSeen(page.id, latestDate).catch(() => {})
    }
  }

  const currentPost = sortedPosts[postIndex] ?? null
  const isLatest = postIndex === 0

  const handleAddPage = async () => {
    const label = newPageLabel.trim()
    if (!label) return
    try {
      await store.addPage({ label })
      setNewPageLabel('')
      setAddingPage(false)
    } catch {
      Alert.alert('Failed to add page')
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Posts' }} />

      {/* Admin build mode toggle */}
      {admin && (
        <XStack
          padding={8}
          justifyContent="flex-end"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <Pressable onPress={() => setBuildMode((v) => !v)}>
            <XStack
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={6}
              backgroundColor={buildMode ? colors.primary : 'transparent'}
              borderWidth={1}
              borderColor={buildMode ? colors.primary : colors.border}
            >
              <Text
                style={{
                  color: buildMode ? '#fff' : (colors.text as string),
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {buildMode ? '✎ Build Mode ON' : '✎ Build Mode'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      )}

      {/* Page selector row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border as string }}
        contentContainerStyle={{ padding: 10, gap: 8 }}
      >
        {pages.map((page) => (
          <PageButton
            key={page.id}
            page={page}
            active={page.id === activePageId}
            unseen={hasUnseenForPage(page)}
            onPress={() => handleSelectPage(page)}
          />
        ))}

        {/* Add page in build mode */}
        {buildMode && admin && (
          addingPage ? (
            <XStack alignItems="flex-end" gap={4}>
              <YStack>
                <TextInput
                  style={[
                    styles.input,
                    {
                      height: 34,
                      color: colors.text as string,
                      borderColor: colors.border as string,
                      backgroundColor: colors.surface as string,
                      minWidth: 120,
                    },
                  ]}
                  value={newPageLabel}
                  onChangeText={setNewPageLabel}
                  placeholder="Page name"
                  placeholderTextColor={colors.textMuted as string}
                  autoFocus
                />
              </YStack>
              <Pressable onPress={handleAddPage}>
                <Text style={{ color: colors.primary as string, fontSize: 20 }}>✓</Text>
              </Pressable>
              <Pressable onPress={() => { setAddingPage(false); setNewPageLabel('') }}>
                <Text style={{ color: colors.textMuted as string, fontSize: 20 }}>✕</Text>
              </Pressable>
            </XStack>
          ) : (
            <Pressable onPress={() => setAddingPage(true)}>
              <YStack
                width={80}
                borderRadius={10}
                borderWidth={1.5}
                borderColor={colors.border}
                borderStyle="dashed"
                height={86}
                justifyContent="center"
                alignItems="center"
              >
                <Text style={{ color: colors.textMuted as string, fontSize: 22 }}>+</Text>
                <Text style={{ color: colors.textMuted as string, fontSize: 10 }}>Add Page</Text>
              </YStack>
            </Pressable>
          )
        )}
      </ScrollView>

      <ScrollView style={{ flex: 1 }}>
        {/* ── Normal view mode ── */}
        {!buildMode && (
          <YStack padding={16} gap={16}>
            {pages.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius={10}
                padding={24}
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
              >
                <Text style={{ color: colors.textMuted as string }}>No pages configured yet.</Text>
              </YStack>
            ) : !activePage ? null : sortedPosts.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius={10}
                padding={24}
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
                gap={10}
              >
                <Text style={{ color: colors.textMuted as string }}>No posts yet.</Text>
                {activePage.fbUrl && (
                  <Pressable onPress={() => Linking.openURL(activePage.fbUrl!).catch(() => {})}>
                    <Text style={{ color: '#1877F2', fontSize: 14 }}>View on Facebook ↗</Text>
                  </Pressable>
                )}
              </YStack>
            ) : (
              <>
                {/* Newer / Older navigation */}
                <XStack justifyContent="space-between" alignItems="center">
                  <Pressable
                    onPress={() => setPostIndex((i) => Math.max(0, i - 1))}
                    disabled={postIndex === 0}
                  >
                    <XStack
                      paddingHorizontal={12}
                      paddingVertical={6}
                      borderRadius={6}
                      borderWidth={1}
                      borderColor={colors.border}
                      opacity={postIndex === 0 ? 0.3 : 1}
                    >
                      <Text style={{ color: colors.text as string, fontSize: 13 }}>← Newer</Text>
                    </XStack>
                  </Pressable>

                  <YStack alignItems="center">
                    <Text style={{ fontSize: 13, color: colors.textMuted as string }}>
                      {currentPost ? FD(currentPost.date) : ''}
                    </Text>
                    {isLatest && (
                      <XStack paddingHorizontal={6} paddingVertical={2} borderRadius={4} backgroundColor={colors.primary}>
                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>Latest</Text>
                      </XStack>
                    )}
                  </YStack>

                  <Pressable
                    onPress={() => setPostIndex((i) => Math.min(sortedPosts.length - 1, i + 1))}
                    disabled={postIndex >= sortedPosts.length - 1}
                  >
                    <XStack
                      paddingHorizontal={12}
                      paddingVertical={6}
                      borderRadius={6}
                      borderWidth={1}
                      borderColor={colors.border}
                      opacity={postIndex >= sortedPosts.length - 1 ? 0.3 : 1}
                    >
                      <Text style={{ color: colors.text as string, fontSize: 13 }}>Older →</Text>
                    </XStack>
                  </Pressable>
                </XStack>

                {/* Current post card */}
                {currentPost && (
                  <PostCard
                    post={currentPost}
                    page={activePage}
                    isLatest={isLatest}
                    admin={admin}
                    buildMode={false}
                    onDelete={() => {}}
                  />
                )}

                {/* Page description */}
                {activePage.desc && (
                  <Text style={{ fontSize: 13, color: colors.textMuted as string, textAlign: 'center' }}>
                    {activePage.desc}
                  </Text>
                )}

                {/* Browse Archive */}
                <Pressable onPress={() => setArchiveOpen((v) => !v)}>
                  <XStack
                    backgroundColor={colors.surface}
                    borderRadius={8}
                    padding={12}
                    borderWidth={1}
                    borderColor={colors.border}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text style={{ color: colors.text as string, fontSize: 13 }}>
                      Browse Archive ({sortedPosts.length} posts)
                    </Text>
                    <Text style={{ color: colors.textMuted as string, fontSize: 13 }}>
                      {archiveOpen ? '▲' : '▼'}
                    </Text>
                  </XStack>
                </Pressable>

                {archiveOpen && (
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius={8}
                    borderWidth={1}
                    borderColor={colors.border}
                    overflow="hidden"
                  >
                    {sortedPosts.map((post, idx) => (
                      <Pressable key={post.id} onPress={() => { setPostIndex(idx); setArchiveOpen(false) }}>
                        <XStack
                          paddingHorizontal={14}
                          paddingVertical={10}
                          borderBottomWidth={idx < sortedPosts.length - 1 ? 1 : 0}
                          borderBottomColor={colors.border}
                          alignItems="center"
                          gap={10}
                        >
                          <Text style={{ fontSize: 12, color: colors.textMuted as string, width: 90 }}>
                            {post.date}
                          </Text>
                          <Text
                            style={{ flex: 1, fontSize: 13, color: postIndex === idx ? (colors.primary as string) : (colors.text as string) }}
                            numberOfLines={1}
                          >
                            {post.title || '(no title)'}
                          </Text>
                          {postIndex === idx && (
                            <Text style={{ color: colors.primary as string, fontSize: 12 }}>◀</Text>
                          )}
                        </XStack>
                      </Pressable>
                    ))}
                  </YStack>
                )}
              </>
            )}
          </YStack>
        )}

        {/* ── Build Mode (admin) ── */}
        {buildMode && admin && (
          <YStack padding={16} gap={16}>
            {pages.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius={10}
                padding={20}
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
              >
                <Text style={{ color: colors.textMuted as string }}>
                  No pages yet. Use "+ Add Page" above.
                </Text>
              </YStack>
            ) : (
              pages.map((page) => <PageEditor key={page.id} page={page} />)
            )}
          </YStack>
        )}
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
  },
})
