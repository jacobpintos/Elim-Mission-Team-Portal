import { useEffect, useState } from 'react'
import { ScrollView, TextInput, StyleSheet, Pressable, View } from 'react-native'
import { YStack, XStack, Text, TextArea } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { usePostsStore } from '@/stores/postsStore'
import { useConfigStore } from '@/stores/configStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { Avatar } from '@/components/ui/Avatar'
import { isAdmin } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { shortTime } from '@/lib/format'
import type { Post, PostPage, PostComment } from '@/types/events'

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function makePost(uid: string, body: string): Post {
  return { id: nanoid(), ts: Date.now(), author: uid, body, likes: {}, comments: [] }
}

function makeComment(uid: string, body: string): PostComment {
  return { id: nanoid(), uid, body, ts: Date.now() }
}

function makePage(label: string): PostPage {
  return { id: nanoid(), label, posts: [] }
}

export default function Posts() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

  const postsStore = usePostsStore()
  const configStore = useConfigStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const toast = useUIStore((s) => s.toast)

  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [buildMode, setBuildMode] = useState(false)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [commentText, setCommentText] = useState<Record<string, string>>({})
  const [addPostText, setAddPostText] = useState('')
  const [addingPost, setAddingPost] = useState(false)
  const [newPageLabel, setNewPageLabel] = useState('')
  const [addingPage, setAddingPage] = useState(false)

  useEffect(() => {
    postsStore.refreshConfig().catch(() => {})
    configStore.subscribe()
    subUsers()
    return () => {
      configStore.unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { pages } = postsStore.config
  // Derive active page: if no explicit selection, fall back to first page
  const resolvedPageId = activePageId ?? pages[0]?.id ?? null
  const activePage = pages.find((p) => p.id === resolvedPageId) ?? null

  // Sync explicit selection when pages first load (runs only once)
  useEffect(() => {
    if (!activePageId && pages.length > 0) {
      // Use a timeout so setState doesn't fire during the render pass
      const id = pages[0].id
      setTimeout(() => setActivePageId(id), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length])

  // Mark page as seen when opening
  const handleSelectPage = (page: PostPage) => {
    setActivePageId(page.id)
    if (uid) configStore.markPageSeen(uid, page.id).catch(() => {})
  }

  const hasUnseen = (page: PostPage): boolean => {
    if (!uid) return false
    const lastSeen = configStore.lastSeenPosts[`${uid}_${page.id}`] ?? 0
    return page.posts.some((p) => p.ts > lastSeen)
  }

  const getUserInfo = (authorId: string | number) => {
    const u = users.find((x) => sameId(x.uid, authorId))
    return { displayName: u?.displayName ?? String(authorId), photoURL: u?.photoURL }
  }

  const handleLike = async (pageId: string, postId: string) => {
    await postsStore.likePost(pageId, postId, uid)
  }

  const handleAddComment = async (pageId: string, postId: string) => {
    const body = commentText[postId]?.trim()
    if (!body) return
    await postsStore.addComment(pageId, postId, makeComment(uid, body))
    setCommentText((v) => ({ ...v, [postId]: '' }))
  }

  const handleAddPost = async () => {
    if (!activePage || !addPostText.trim()) return
    setAddingPost(true)
    try {
      await postsStore.addPost(activePage.id, makePost(uid, addPostText.trim()))
      setAddPostText('')
      toast('Post added', 'success')
    } catch {
      toast('Failed to add post', 'error')
    } finally {
      setAddingPost(false)
    }
  }

  const handleDeletePost = async (pageId: string, postId: string) => {
    await postsStore.deletePost(pageId, postId)
    toast('Post deleted', 'info')
  }

  const handleAddPage = async () => {
    if (!newPageLabel.trim()) return
    await postsStore.addPage(makePage(newPageLabel.trim()))
    setNewPageLabel('')
    setAddingPage(false)
    toast('Page added', 'success')
  }

  const handleDeletePage = async (pageId: string) => {
    await postsStore.deletePage(pageId)
    if (activePageId === pageId) setActivePageId(pages[0]?.id ?? null)
    toast('Page deleted', 'info')
  }

  const sortedPosts = activePage ? [...activePage.posts].sort((a, b) => b.ts - a.ts) : []

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Posts' }} />

      {/* Top bar: build mode toggle for admin */}
      {admin ? (
        <XStack
          padding="$2"
          justifyContent="flex-end"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <Pressable onPress={() => setBuildMode((v) => !v)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius="$2"
              backgroundColor={buildMode ? colors.primary : 'transparent'}
              borderWidth={1}
              borderColor={buildMode ? colors.primary : colors.border}
            >
              <Text color={buildMode ? 'white' : colors.text} fontSize="$2" fontWeight="600">
                {buildMode ? '✎ Build Mode ON' : '✎ Build Mode'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}

      {/* Page tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexGrow: 0,
        }}
        contentContainerStyle={{ padding: 8, gap: 8 }}
      >
        {pages.map((page) => {
          const unseen = hasUnseen(page)
          const isActive = page.id === activePage?.id
          return (
            <Pressable key={page.id} onPress={() => handleSelectPage(page)}>
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$2"
                backgroundColor={isActive ? colors.primary : 'transparent'}
                borderWidth={1}
                borderColor={isActive ? colors.primary : colors.border}
                position="relative"
                gap="$1"
                alignItems="center"
              >
                <Text
                  color={isActive ? 'white' : colors.text}
                  fontSize="$3"
                  fontWeight={isActive ? '700' : '400'}
                >
                  {page.label}
                </Text>
                {unseen && !isActive ? (
                  <YStack width={8} height={8} borderRadius={4} backgroundColor={colors.primary} />
                ) : null}
                {buildMode && admin ? (
                  <Pressable onPress={() => handleDeletePage(page.id)}>
                    <Text color={isActive ? 'white' : '#c0392b'} fontSize={10} marginLeft={4}>
                      ✕
                    </Text>
                  </Pressable>
                ) : null}
              </XStack>
            </Pressable>
          )
        })}

        {/* Add page button in build mode */}
        {buildMode && admin ? (
          addingPage ? (
            <XStack gap="$1" alignItems="center">
              <TextInput
                style={[
                  styles.inlineInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                value={newPageLabel}
                onChangeText={setNewPageLabel}
                placeholder="Page name"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Pressable onPress={handleAddPage}>
                <Text color={colors.primary} fontSize="$3">
                  ✓
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAddingPage(false)
                  setNewPageLabel('')
                }}
              >
                <Text color={colors.textMuted} fontSize="$3">
                  ✕
                </Text>
              </Pressable>
            </XStack>
          ) : (
            <Pressable onPress={() => setAddingPage(true)}>
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$2"
                borderWidth={1}
                borderColor={colors.border}
                borderStyle="dashed"
              >
                <Text color={colors.textMuted} fontSize="$3">
                  + Add Page
                </Text>
              </XStack>
            </Pressable>
          )
        ) : null}
      </ScrollView>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {/* Add post form in build mode or for all users */}
          {(buildMode || !admin) && activePage ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
            >
              <TextArea
                value={addPostText}
                onChangeText={setAddPostText}
                placeholder="Write a post…"
                backgroundColor={colors.background}
                color={colors.text}
                borderColor={colors.border}
                minHeight={80}
              />
              <Pressable onPress={handleAddPost} disabled={!addPostText.trim() || addingPost}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignSelf="flex-start"
                  opacity={addPostText.trim() && !addingPost ? 1 : 0.5}
                >
                  <Text color="white" fontWeight="600" fontSize="$3">
                    {addingPost ? 'Posting…' : 'Post'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : null}

          {/* Posts feed */}
          {!activePage ? (
            <YStack alignItems="center" padding="$4">
              <Text color={colors.textMuted}>No pages configured yet.</Text>
            </YStack>
          ) : sortedPosts.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$4"
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text color={colors.textMuted}>No posts yet.</Text>
            </YStack>
          ) : (
            sortedPosts.map((post) => {
              const { displayName, photoURL } = getUserInfo(post.author)
              const likeCount = Object.keys(post.likes ?? {}).length
              const iLiked = !!(post.likes ?? {})[uid]
              const commentExpanded = expandedComments.has(post.id)
              const commentCount = (post.comments ?? []).length

              return (
                <YStack
                  key={post.id}
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  overflow="hidden"
                >
                  {/* Author row */}
                  <XStack padding="$3" gap="$2" alignItems="center">
                    <Avatar uri={photoURL} displayName={displayName} size={36} />
                    <YStack flex={1}>
                      <Text color={colors.text} fontWeight="700" fontSize="$3">
                        {displayName}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        {shortTime(post.ts)}
                      </Text>
                    </YStack>
                    {buildMode && admin ? (
                      <Pressable onPress={() => handleDeletePost(activePage.id, post.id)}>
                        <Text color="#c0392b" fontSize="$3">
                          🗑
                        </Text>
                      </Pressable>
                    ) : null}
                  </XStack>

                  {/* Body */}
                  <YStack paddingHorizontal="$3" paddingBottom="$2">
                    <Text color={colors.text} fontSize="$3">
                      {post.body}
                    </Text>
                  </YStack>

                  {/* Images */}
                  {post.images && post.images.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <XStack padding="$2" gap="$2">
                        {post.images.map((url, i) => (
                          <View
                            key={i}
                            style={{ width: 200, height: 150, borderRadius: 8, overflow: 'hidden' }}
                          >
                            <img
                              src={url}
                              alt="post image"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </View>
                        ))}
                      </XStack>
                    </ScrollView>
                  ) : null}

                  {/* Like / Comment actions */}
                  <XStack padding="$2" gap="$3" borderTopWidth={1} borderTopColor={colors.border}>
                    <Pressable onPress={() => handleLike(activePage.id, post.id)}>
                      <XStack gap="$1" alignItems="center">
                        <Text fontSize="$3">{iLiked ? '❤️' : '🤍'}</Text>
                        <Text color={iLiked ? '#e74c3c' : colors.textMuted} fontSize="$2">
                          {likeCount > 0 ? likeCount : ''} Like
                        </Text>
                      </XStack>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setExpandedComments((s) => {
                          const n = new Set(s)
                          if (n.has(post.id)) n.delete(post.id)
                          else n.add(post.id)
                          return n
                        })
                      }
                    >
                      <XStack gap="$1" alignItems="center">
                        <Text fontSize="$3">💬</Text>
                        <Text color={colors.textMuted} fontSize="$2">
                          {commentCount > 0 ? commentCount : ''} Comment
                        </Text>
                      </XStack>
                    </Pressable>
                  </XStack>

                  {/* Comments section */}
                  {commentExpanded ? (
                    <YStack borderTopWidth={1} borderTopColor={colors.border} padding="$2" gap="$2">
                      {(post.comments ?? []).map((c) => {
                        const cu = getUserInfo(c.uid)
                        return (
                          <XStack key={c.id} gap="$2" alignItems="flex-start">
                            <Avatar uri={cu.photoURL} displayName={cu.displayName} size={28} />
                            <YStack
                              flex={1}
                              backgroundColor={colors.background}
                              borderRadius="$2"
                              padding="$2"
                            >
                              <Text color={colors.text} fontWeight="600" fontSize="$2">
                                {cu.displayName}
                              </Text>
                              <Text color={colors.text} fontSize="$2">
                                {c.body}
                              </Text>
                            </YStack>
                          </XStack>
                        )
                      })}

                      {/* Add comment */}
                      <XStack gap="$2" alignItems="center">
                        <TextInput
                          style={[
                            styles.commentInput,
                            {
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                          value={commentText[post.id] ?? ''}
                          onChangeText={(v) => setCommentText((x) => ({ ...x, [post.id]: v }))}
                          placeholder="Add a comment…"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Pressable onPress={() => handleAddComment(activePage.id, post.id)}>
                          <Text color={colors.primary} fontSize="$3">
                            ↑
                          </Text>
                        </Pressable>
                      </XStack>
                    </YStack>
                  ) : null}
                </YStack>
              )
            })
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  inlineInput: {
    height: 32,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 13,
    minWidth: 100,
  },
  commentInput: {
    flex: 1,
    height: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 17,
    fontSize: 13,
  },
})
