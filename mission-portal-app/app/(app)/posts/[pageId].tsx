import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { usePostsStore } from '@/stores/postsStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { likeFbPost, unlikeFbPost, postFbComment } from '@/lib/fbGraph'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Img } from '@/components/ui/Img'

// Shape of posts — from Firestore (Zapier) or demo fallback
interface FbPost {
  id: string
  message?: string
  story?: string
  fullPicture?: string
  permalinkUrl?: string
  createdTime: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  topComments: { id: string; fromName: string; fromPicture?: string; message: string; createdTime: string }[]
}

// Demo posts shown while the Facebook integration is pending approval.
// Replace with real data after Zapier + Graph API are wired in.
const DEMO_POSTS: FbPost[] = [
  {
    id: 'demo_1',
    message:
      "What an incredible Sunday service! The worship team led us into such a powerful time of praise, and the message on John 15 — abiding in Christ — was exactly what our hearts needed. Thank you to everyone who joined us in person and online. We'll see you next week! 🙌",
    fullPicture: 'https://picsum.photos/seed/elim-worship/600/340',
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 2 * 3600000).toISOString(),
    likesCount: 47,
    commentsCount: 12,
    sharesCount: 8,
    topComments: [
      { id: 'c1', fromName: 'Maria L.', message: 'Such a beautiful service! Pastor really hit it out of the park 🙏', createdTime: new Date(Date.now() - 90 * 60000).toISOString() },
      { id: 'c2', fromName: 'James K.', message: 'The worship was amazing today! Blessed to be part of this church family.', createdTime: new Date(Date.now() - 60 * 60000).toISOString() },
    ],
  },
  {
    id: 'demo_2',
    message:
      'Our Youth Mission Team just returned from an amazing weekend serving in the community! They cooked and distributed over 200 hot meals, prayed with families, and shared the love of Christ with those in need. We are SO proud of these young servants of God. This is what the church is all about. 🙏❤️',
    fullPicture: 'https://picsum.photos/seed/elim-mission/600/340',
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 2 * 86400000).toISOString(),
    likesCount: 83,
    commentsCount: 24,
    sharesCount: 15,
    topComments: [
      { id: 'c3', fromName: 'Sarah T.', message: 'So proud of our youth! What a testimony 🔥', createdTime: new Date(Date.now() - 44 * 3600000).toISOString() },
    ],
  },
  {
    id: 'demo_3',
    message:
      '📅 SAVE THE DATE — Elim Summer Conference 2025 is July 18–20!\n\nThree days of powerful worship, anointed teaching, and deep fellowship. Guest speakers will be announced soon. Early registration is now open — spots are limited!\n\nTap the link in our bio to register or visit our website.',
    fullPicture: 'https://picsum.photos/seed/elim-conference/600/340',
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 4 * 86400000).toISOString(),
    likesCount: 61,
    commentsCount: 18,
    sharesCount: 31,
    topComments: [],
  },
]

const DEMO_ARCHIVE: FbPost[] = [
  {
    id: 'arc_1',
    message:
      'Congratulations to our newest baptism class! 💦 What a beautiful and holy moment as 14 members made their public declaration of faith in Jesus Christ. Heaven is celebrating today — and so are we! Welcome to the family.',
    fullPicture: 'https://picsum.photos/seed/elim-baptism/600/340',
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 10 * 86400000).toISOString(),
    likesCount: 156,
    commentsCount: 43,
    sharesCount: 28,
    topComments: [],
  },
  {
    id: 'arc_2',
    message:
      "A huge thank you to every single volunteer who served at last Sunday's special service event! From setup to hospitality to teardown — your faithfulness and sacrifice make this ministry possible. God sees every act of service, and so do we. ❤️",
    fullPicture: undefined,
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 17 * 86400000).toISOString(),
    likesCount: 92,
    commentsCount: 17,
    sharesCount: 6,
    topComments: [],
  },
  {
    id: 'arc_3',
    message:
      "📢 New sermon series starting this Sunday: \"Rooted\" — a 6-week journey through the book of Colossians exploring what it means to be grounded in Christ. Bring a friend — you won't want to miss this one!",
    fullPicture: 'https://picsum.photos/seed/elim-series/600/340',
    permalinkUrl: 'https://www.facebook.com/',
    createdTime: new Date(Date.now() - 24 * 86400000).toISOString(),
    likesCount: 44,
    commentsCount: 9,
    sharesCount: 19,
    topComments: [],
  },
]

function timeSince(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(isoString)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export default function PageFeed() {
  const colors = useThemeColors()
  const router = useRouter()
  const { pageId } = useLocalSearchParams<{ pageId: string }>()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)
  const postsStore = usePostsStore()

  const [loadingConfig, setLoadingConfig] = useState(true)
  const [firestorePosts, setFirestorePosts] = useState<FbPost[] | null>(null)
  const [localLikes, setLocalLikes] = useState<Record<string, boolean>>({})
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [commentText, setCommentText] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<Record<string, boolean>>({})
  const [localComments, setLocalComments] = useState<Record<string, FbPost['topComments']>>({})
  const [showArchive, setShowArchive] = useState(false)

  useEffect(() => {
    postsStore.refreshConfig().finally(() => setLoadingConfig(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const page = postsStore.config.pages.find((p) => p.id === pageId) ?? null

  // Subscribe to Firestore posts written by Zapier once fbPageId is configured
  useEffect(() => {
    if (!page?.fbPageId) return
    const q = query(
      collection(db, 'fbPagePosts', page.fbPageId, 'posts'),
      orderBy('createdTime', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      const posts = snap.docs.map((d) => {
        const data = d.data() as Omit<FbPost, 'id'>
        return { ...data, id: d.id, topComments: data.topComments ?? [] }
      })
      setFirestorePosts(posts)
    })
    return () => unsub()
  }, [page?.fbPageId])

  if (loadingConfig) {
    return (
      <YStack flex={1} backgroundColor={colors.background} alignItems="center" justifyContent="center">
        <ScreenTitle options={{ title: 'Posts' }} />
        <Text color={colors.textMuted}>Loading…</Text>
      </YStack>
    )
  }

  if (!page) {
    return (
      <YStack flex={1} backgroundColor={colors.background}>
        <ScreenTitle options={{ title: 'Posts' }} />
        <Pressable onPress={() => router.back()}>
          <XStack paddingHorizontal="$3" paddingVertical="$2" alignItems="center" borderBottomWidth={1} borderBottomColor={colors.border}>
            <Text color={colors.primary} fontSize={14}>‹ Posts</Text>
          </XStack>
        </Pressable>
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">Page not found.</Text>
        </YStack>
      </YStack>
    )
  }

  // Use Firestore posts if available, otherwise show demo data
  const isLive = firestorePosts !== null && firestorePosts.length > 0
  const allPosts: FbPost[] = isLive ? firestorePosts : DEMO_POSTS
  const archivePosts: FbPost[] = isLive ? [] : DEMO_ARCHIVE

  const handleLike = async (post: FbPost) => {
    const wasLiked = !!localLikes[post.id]
    setLocalLikes((prev) => ({ ...prev, [post.id]: !wasLiked }))

    if (page.fbToken) {
      try {
        if (wasLiked) {
          await unlikeFbPost(post.id, page.fbToken)
        } else {
          await likeFbPost(post.id, page.fbToken)
        }
      } catch {
        setLocalLikes((prev) => ({ ...prev, [post.id]: wasLiked }))
        toast('Could not post reaction to Facebook', 'error')
      }
    }
  }

  const handleShare = (post: FbPost) => {
    const url = post.permalinkUrl ?? `https://www.facebook.com/${page.fbPageId ?? ''}`
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank',
      'width=600,height=400'
    )
  }

  const handleComment = async (post: FbPost) => {
    const text = commentText[post.id]?.trim()
    if (!text) return

    if (!page.fbToken) {
      window.open(post.permalinkUrl ?? `https://www.facebook.com/${page.fbPageId ?? ''}`, '_blank')
      toast('Opening Facebook to post your comment', 'info')
      return
    }

    setPosting((prev) => ({ ...prev, [post.id]: true }))
    try {
      await postFbComment(post.id, page.fbToken, text)
      const newComment = {
        id: `local_${Date.now()}`,
        fromName: profile?.displayName ?? 'You',
        message: text,
        createdTime: new Date().toISOString(),
      }
      setLocalComments((prev) => ({
        ...prev,
        [post.id]: [...(prev[post.id] ?? post.topComments), newComment],
      }))
      setCommentText((prev) => ({ ...prev, [post.id]: '' }))
      toast('Comment posted', 'success')
    } catch {
      toast('Could not post comment to Facebook', 'error')
    } finally {
      setPosting((prev) => ({ ...prev, [post.id]: false }))
    }
  }

  const toggleComments = (postId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const renderPost = (post: FbPost) => {
    const liked = !!localLikes[post.id]
    const likeCount = post.likesCount + (liked ? 1 : 0)
    const showComments = expandedComments.has(post.id)
    const comments = localComments[post.id] ?? post.topComments

    return (
      <YStack
        key={post.id}
        backgroundColor={colors.surface}
        borderRadius="$3"
        borderWidth={1}
        borderColor={colors.border}
        overflow="hidden"
      >
        {/* Post header */}
        <XStack padding="$3" gap="$2" alignItems="center">
          <View style={styles.pageAvatar}>
            {page.bgImage ? (
              <Img src={page.bgImage} alt={page.label} style={styles.pageAvatarImg} />
            ) : (
              <View style={[styles.pageAvatarImg, { backgroundColor: colors.primary + '55' }]} />
            )}
          </View>
          <YStack flex={1}>
            <Text color={colors.text} fontWeight="700" fontSize="$3">
              {page.label}
            </Text>
            <XStack gap="$1" alignItems="center">
              <Text color={colors.textMuted} fontSize={11}>
                {timeSince(post.createdTime)}
              </Text>
              <Text color={colors.textMuted} fontSize={11}> · </Text>
              <Text color="#1877F2" fontSize={11} fontWeight="700">
                f
              </Text>
            </XStack>
          </YStack>
        </XStack>

        {/* Post text */}
        {post.message ? (
          <YStack paddingHorizontal="$3" paddingBottom="$2">
            <Text color={colors.text} fontSize="$3" lineHeight={20}>
              {post.message}
            </Text>
          </YStack>
        ) : post.story ? (
          <YStack paddingHorizontal="$3" paddingBottom="$2">
            <Text color={colors.text} fontSize="$3" lineHeight={20}>
              {post.story}
            </Text>
          </YStack>
        ) : null}

        {/* Post image */}
        {post.fullPicture ? (
          <Img
            src={post.fullPicture}
            alt="Post"
            style={styles.postImage}
          />
        ) : null}

        {/* Reaction / share counts */}
        {likeCount > 0 || post.commentsCount > 0 || post.sharesCount > 0 ? (
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            justifyContent="space-between"
            alignItems="center"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            {likeCount > 0 ? (
              <XStack gap="$1" alignItems="center">
                <Text fontSize={12}>👍</Text>
                <Text color={colors.textMuted} fontSize={12}>
                  {likeCount}
                </Text>
              </XStack>
            ) : (
              <View />
            )}
            <XStack gap="$2">
              {post.commentsCount > 0 ? (
                <Pressable onPress={() => toggleComments(post.id)}>
                  <Text color={colors.textMuted} fontSize={12}>
                    {post.commentsCount} comment{post.commentsCount !== 1 ? 's' : ''}
                  </Text>
                </Pressable>
              ) : null}
              {post.sharesCount > 0 ? (
                <Text color={colors.textMuted} fontSize={12}>
                  {post.sharesCount} share{post.sharesCount !== 1 ? 's' : ''}
                </Text>
              ) : null}
            </XStack>
          </XStack>
        ) : null}

        {/* Action buttons */}
        <XStack borderTopWidth={1} borderTopColor={colors.border}>
          {(
            [
              { label: liked ? 'Liked' : 'Like', icon: liked ? '👍' : '👍', onPress: () => handleLike(post), active: liked },
              { label: 'Comment', icon: '💬', onPress: () => toggleComments(post.id), active: false },
              { label: 'Share', icon: '↗', onPress: () => handleShare(post), active: false },
            ] as const
          ).map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={{ flex: 1 }}
            >
              <XStack
                paddingVertical="$2"
                justifyContent="center"
                alignItems="center"
                gap="$1"
              >
                <Text fontSize={13}>{action.icon}</Text>
                <Text
                  color={action.active ? '#1877F2' : colors.textMuted}
                  fontSize={12}
                  fontWeight={action.active ? '700' : '400'}
                >
                  {action.label}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>

        {/* Comments section */}
        {showComments ? (
          <YStack borderTopWidth={1} borderTopColor={colors.border} padding="$2" gap="$2">
            {comments.map((c) => (
              <XStack key={c.id} gap="$2" alignItems="flex-start">
                <View style={styles.commentAvatar}>
                  {c.fromPicture ? (
                    <Img src={c.fromPicture} alt={c.fromName} style={styles.commentAvatarImg} />
                  ) : (
                    <Text color="white" fontSize={11} fontWeight="700">
                      {c.fromName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <YStack
                  flex={1}
                  backgroundColor={colors.background}
                  borderRadius="$2"
                  padding="$2"
                >
                  <Text color={colors.text} fontWeight="600" fontSize={12}>
                    {c.fromName}
                  </Text>
                  <Text color={colors.text} fontSize={13}>
                    {c.message}
                  </Text>
                  <Text color={colors.textMuted} fontSize={11} marginTop={2}>
                    {timeSince(c.createdTime)}
                  </Text>
                </YStack>
              </XStack>
            ))}

            {/* Comment input */}
            <XStack gap="$2" alignItems="center" marginTop="$1">
              <View style={[styles.commentAvatar, { backgroundColor: colors.primary }]}>
                <Text color="white" fontSize={11} fontWeight="700">
                  {(profile?.displayName ?? 'Y').charAt(0).toUpperCase()}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.commentInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                ]}
                value={commentText[post.id] ?? ''}
                onChangeText={(v) => setCommentText((prev) => ({ ...prev, [post.id]: v }))}
                placeholder="Write a comment…"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={() => handleComment(post)}
                returnKeyType="send"
              />
              <Pressable
                onPress={() => handleComment(post)}
                disabled={posting[post.id] || !commentText[post.id]?.trim()}
              >
                <XStack
                  backgroundColor={commentText[post.id]?.trim() ? '#1877F2' : colors.border}
                  borderRadius={99}
                  width={30}
                  height={30}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="white" fontSize={14}>
                    ↑
                  </Text>
                </XStack>
              </Pressable>
            </XStack>
          </YStack>
        ) : null}
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: page.label }} />

      {/* Back button — Tabs navigator has no native back, so provide one explicitly */}
      <Pressable onPress={() => router.back()}>
        <XStack paddingHorizontal="$3" paddingVertical="$2" alignItems="center" borderBottomWidth={1} borderBottomColor={colors.border}>
          <Text color={colors.primary} fontSize={14}>‹ Posts</Text>
        </XStack>
      </Pressable>

      {!isLive && admin ? (
        <XStack
          backgroundColor={colors.primary + '18'}
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$2"
          alignItems="center"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <Text fontSize={14}>ℹ️</Text>
          <Text color={colors.primary} fontSize={12} flex={1}>
            Demo preview — real posts will appear here after Zapier &amp; Facebook are connected.
          </Text>
        </XStack>
      ) : null}

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {allPosts.map(renderPost)}

          {/* Archive section */}
          {archivePosts.length > 0 || (isLive && firestorePosts && firestorePosts.length === 0) ? null : (
            <YStack gap="$3">
              <Pressable onPress={() => setShowArchive((v) => !v)}>
                <XStack alignItems="center" gap="$2" paddingVertical="$2">
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  <XStack
                    backgroundColor={colors.surface}
                    borderRadius={99}
                    paddingHorizontal="$3"
                    paddingVertical="$1"
                    borderWidth={1}
                    borderColor={colors.border}
                    gap="$1"
                    alignItems="center"
                  >
                    <Text color={colors.textMuted} fontSize={12} fontWeight="600">
                      📦 Past Posts
                    </Text>
                    <Text color={colors.textMuted} fontSize={11}>
                      {showArchive ? '▲' : '▼'}
                    </Text>
                  </XStack>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                </XStack>
              </Pressable>

              {showArchive ? archivePosts.map(renderPost) : null}
            </YStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  pageAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1877F222',
  },
  pageAvatarImg: {
    width: '100%' as unknown as number,
    height: '100%' as unknown as number,
    objectFit: 'cover' as unknown as 'cover',
  } as object,
  postImage: {
    width: '100%',
    maxHeight: 320,
    objectFit: 'cover',
    display: 'block',
  } as object,
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarImg: {
    width: '100%' as unknown as number,
    height: '100%' as unknown as number,
    objectFit: 'cover' as unknown as 'cover',
  } as object,
  commentInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
    fontSize: 13,
  },
})
