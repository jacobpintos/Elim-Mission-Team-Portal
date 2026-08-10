import { useEffect, useState } from 'react'
import { ScrollView, Pressable, View, StyleSheet, Linking, Platform, Share } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { usePostsStore } from '@/stores/postsStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { facebookUrlFor, type FbPost } from '@/lib/fbGraph'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Img } from '@/components/ui/Img'

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
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
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
  // Tagged with the Page it came from, so switching pages shows a loading
  // state rather than briefly rendering the previous Page's posts.
  const [feed, setFeed] = useState<{ pageId: string; posts: FbPost[] } | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  useEffect(() => {
    postsStore.refreshConfig().finally(() => setLoadingConfig(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const page = postsStore.config.pages.find((p) => p.id === pageId) ?? null
  const fbPageId = page?.fbPageId

  // Live feed. The sync functions write these documents; new posts arrive
  // here on their own, without a refresh or a pull-to-reload.
  useEffect(() => {
    if (!fbPageId) return
    const q = query(
      collection(db, 'fbPagePosts', fbPageId, 'posts'),
      orderBy('createdTime', 'desc')
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFeed({
          pageId: fbPageId,
          posts: snap.docs.map((d) => {
            const data = d.data() as Omit<FbPost, 'id'>
            return { ...data, id: d.id, topComments: data.topComments ?? [] }
          }),
        })
      },
      () => setFeed({ pageId: fbPageId, posts: [] })
    )
    return () => unsub()
  }, [fbPageId])

  const posts = feed && feed.pageId === fbPageId ? feed.posts : null

  if (loadingConfig) {
    return (
      <YStack
        flex={1}
        backgroundColor={colors.background}
        alignItems="center"
        justifyContent="center"
      >
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
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            <Text color={colors.primary} fontSize={14}>
              ‹ Posts
            </Text>
          </XStack>
        </Pressable>
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            Page not found.
          </Text>
        </YStack>
      </YStack>
    )
  }

  // `window.open` does not exist in React Native — route through Linking,
  // which opens the Facebook app on device and a tab on web.
  const openExternal = (url: string, popup = false) => {
    if (Platform.OS === 'web' && popup) {
      window.open(url, '_blank', 'width=600,height=500')
      return
    }
    Linking.openURL(url).catch(() => toast('Could not open Facebook', 'error'))
  }

  /**
   * Every action leaves the app.
   *
   * Meta has no API for liking or commenting as the signed-in member — that
   * went away with `publish_actions` and was never replaced — so the honest
   * version is to hand them the real post, where they are already themselves.
   */
  const openOnFacebook = (post: FbPost) => openExternal(facebookUrlFor(post, fbPageId))

  const handleShare = async (post: FbPost) => {
    const url = facebookUrlFor(post, fbPageId)
    if (Platform.OS === 'web') {
      openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, true)
      return
    }
    // The OS sheet reaches Messenger, SMS and everything else, and works even
    // when the Facebook app is not installed.
    try {
      await Share.share({ message: `${page.label}\n${url}`, url })
    } catch {
      // Dismissing the sheet is a normal outcome, not an error worth a toast.
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
    const showComments = expandedComments.has(post.id)
    const body = post.message ?? post.story

    return (
      <YStack
        key={post.id}
        backgroundColor={colors.surface}
        borderRadius="$3"
        borderWidth={1}
        borderColor={colors.border}
        overflow="hidden"
      >
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
              <Text color={colors.textMuted} fontSize={11}>
                {' '}
                ·{' '}
              </Text>
              <Text color="#1877F2" fontSize={11} fontWeight="700">
                f
              </Text>
            </XStack>
          </YStack>
        </XStack>

        {body ? (
          <YStack paddingHorizontal="$3" paddingBottom="$2">
            <Text color={colors.text} fontSize="$3" lineHeight={20}>
              {body}
            </Text>
          </YStack>
        ) : null}

        {post.fullPicture ? (
          <Pressable onPress={() => openOnFacebook(post)}>
            <Img src={post.fullPicture} alt="Post" style={styles.postImage} />
          </Pressable>
        ) : null}

        {/* Counts come from Facebook at the last sync, so they are shown as a
            read-only summary rather than something that reacts to a tap. */}
        {post.likesCount > 0 || post.commentsCount > 0 || post.sharesCount > 0 ? (
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            justifyContent="space-between"
            alignItems="center"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            {post.likesCount > 0 ? (
              <XStack gap="$1" alignItems="center">
                <Text fontSize={12}>👍</Text>
                <Text color={colors.textMuted} fontSize={12}>
                  {post.likesCount}
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

        <XStack borderTopWidth={1} borderTopColor={colors.border}>
          {(
            [
              {
                key: 'like',
                label: 'Like on Facebook',
                icon: '👍',
                onPress: () => openOnFacebook(post),
              },
              { key: 'comment', label: 'Comment', icon: '💬', onPress: () => openOnFacebook(post) },
              { key: 'share', label: 'Share', icon: '↗', onPress: () => handleShare(post) },
            ] as const
          ).map((action) => (
            <Pressable key={action.key} onPress={action.onPress} style={{ flex: 1 }}>
              <XStack paddingVertical="$2" justifyContent="center" alignItems="center" gap="$1">
                <Text fontSize={13}>{action.icon}</Text>
                <Text color={colors.textMuted} fontSize={12} numberOfLines={1}>
                  {action.label}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>

        {showComments && post.topComments.length > 0 ? (
          <YStack borderTopWidth={1} borderTopColor={colors.border} padding="$2" gap="$2">
            {post.topComments.map((c) => (
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
                <YStack flex={1} backgroundColor={colors.background} borderRadius="$2" padding="$2">
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

            <Pressable onPress={() => openOnFacebook(post)}>
              <XStack paddingVertical="$2" justifyContent="center">
                <Text color="#1877F2" fontSize={12} fontWeight="600">
                  {post.commentsCount > post.topComments.length
                    ? `View all ${post.commentsCount} comments on Facebook`
                    : 'Reply on Facebook'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        ) : null}
      </YStack>
    )
  }

  const notLinked = !fbPageId
  const loadingPosts = !notLinked && posts === null
  const empty = !notLinked && posts !== null && posts.length === 0

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: page.label }} />

      {/* Back button — the Tabs navigator has no native back affordance. */}
      <Pressable onPress={() => router.back()}>
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <Text color={colors.primary} fontSize={14}>
            ‹ Posts
          </Text>
        </XStack>
      </Pressable>

      {notLinked && admin ? (
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
            No Facebook Page linked yet. Open ⚙ Build on the Posts list to connect one.
          </Text>
        </XStack>
      ) : null}

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {loadingPosts ? (
            <YStack alignItems="center" padding="$6">
              <Text color={colors.textMuted}>Loading posts…</Text>
            </YStack>
          ) : null}

          {notLinked || empty ? (
            <YStack alignItems="center" justifyContent="center" padding="$6" gap="$3">
              <Text fontSize={32}>📰</Text>
              <Text color={colors.text} fontWeight="700" fontSize="$5" textAlign="center">
                {notLinked ? 'Not connected yet' : 'No posts yet'}
              </Text>
              <Text color={colors.textMuted} textAlign="center" fontSize="$3">
                {notLinked
                  ? 'This page will fill up once its Facebook Page has been connected.'
                  : 'When this Facebook Page posts something, it will appear here automatically.'}
              </Text>
              {page.fbUrl ? (
                <Pressable onPress={() => openExternal(page.fbUrl!)}>
                  <Text color="#1877F2" fontSize={13} fontWeight="600">
                    Visit the Page on Facebook
                  </Text>
                </Pressable>
              ) : null}
            </YStack>
          ) : null}

          {posts?.map(renderPost)}
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
})
