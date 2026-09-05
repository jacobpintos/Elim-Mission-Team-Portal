import { useEffect, useState } from 'react'
import {
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  View,
  Platform,
  Linking,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMusicStore, extractYouTubeId, youtubeThumbnail } from '@/stores/musicStore'
import type { MusicItem } from '@/stores/musicStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { useUIStore } from '@/stores/uiStore'
import {
  searchMusic,
  scopeLabel,
  SEARCH_SCOPES,
  DEFAULT_SCOPE,
  type SearchScope,
} from '@/lib/musicSearch'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Img } from '@/components/ui/Img'

function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const TYPE_LABELS: Record<MusicItem['type'], string> = {
  music: 'Music',
  podcast: 'Podcasts',
  sermon: 'Sermons',
}

function isItemNew(item: MusicItem): boolean {
  if (!item.isNew) return false
  if (item.newUntil) {
    return new Date(item.newUntil) >= new Date()
  }
  return true
}

function YouTubeEmbed({ url }: { url: string }) {
  const id = extractYouTubeId(url)
  if (!id) return null

  // React Native has no <iframe> host component. On native, embed the YouTube
  // player inline via a WebView so the video plays inside the app.
  //
  // Loading the embed URL directly with `source={{ uri }}` fails with
  // "Error 153 — Video player configuration error": the WebView has no origin,
  // so YouTube's player rejects the embed. The wrapper below supplies one.
  //
  // That origin has to be a real site we control, not youtube.com. Claiming
  // YouTube's own domain as the referrer satisfies 153 but trips "Error 152",
  // because the player validates the embedding origin and a self-referential
  // one is not accepted. Using the deployed web app's origin — the same one
  // whose iframe plays these videos without complaint — satisfies both, and
  // `origin=` must match `baseUrl` or the player rejects the mismatch.
  if (Platform.OS !== 'web') {
    const origin = process.env.EXPO_PUBLIC_APP_URL ?? 'https://mission-team-portal.web.app'
    const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{border:0;display:block;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=1&fs=1&origin=${encodeURIComponent(origin)}"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen></iframe>
</body></html>`
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <WebView
          source={{ html, baseUrl: origin }}
          style={{ flex: 1, backgroundColor: '#000' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          // The player's own "Watch video on YouTube" link tries to navigate the
          // WebView, which either does nothing or strands the user in a bare
          // browser with no way back. Send anything that leaves the embed to the
          // YouTube app instead.
          onShouldStartLoadWithRequest={(req) => {
            const inEmbed =
              req.url.startsWith('https://www.youtube.com/embed/') ||
              req.url.startsWith(origin) ||
              req.url.startsWith('about:') ||
              req.url.startsWith('data:')
            if (inEmbed) return true
            if (/^https?:/.test(req.url)) {
              Linking.openURL(req.url).catch(() => {})
              return false
            }
            return true
          }}
        />
        {/* A backstop for the cases origin config cannot cover: a video whose
            owner really has disabled embedding, or one restricted by region or
            age. The player refuses those no matter how the embed is set up, so
            there is always a way through to YouTube itself. */}
        <Pressable onPress={() => Linking.openURL(url).catch(() => {})}>
          <XStack
            paddingVertical="$3"
            justifyContent="center"
            alignItems="center"
            gap="$2"
            backgroundColor="#000"
          >
            <Text color="white" fontSize="$3" fontWeight="600">
              ▶ Open in YouTube
            </Text>
            <Text color="#aaa" fontSize="$2">
              (if the video will not play here)
            </Text>
          </XStack>
        </Pressable>
      </View>
    )
  }

  const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1`
  return (
    <iframe
      src={embedUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}

function Thumbnail({ url, size = 120 }: { url: string; size?: number }) {
  const colors = useThemeColors()
  const thumb = url ? youtubeThumbnail(url) : ''
  if (!thumb) {
    return (
      <View
        style={{
          width: size,
          height: Math.round(size * 0.56),
          backgroundColor: colors.surface,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text fontSize="$5">▶</Text>
      </View>
    )
  }
  return (
    <Img
      src={thumb}
      alt="thumbnail"
      style={{
        width: size,
        height: Math.round(size * 0.56),
        objectFit: 'cover',
        borderRadius: 6,
      }}
    />
  )
}

function ContentCard({
  item,
  onPlay,
  onEdit,
  onDelete,
  buildMode,
}: {
  item: MusicItem
  onPlay: (item: MusicItem) => void
  onEdit: (item: MusicItem) => void
  onDelete: (id: string) => void
  buildMode: boolean
}) {
  const colors = useThemeColors()
  const isNew = isItemNew(item)

  return (
    <YStack
      width={180}
      backgroundColor={colors.surface}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      overflow="hidden"
      marginRight="$3"
    >
      <Pressable onPress={() => onPlay(item)}>
        <YStack position="relative">
          <Thumbnail url={item.youtubeUrl} size={180} />
          {/* Play overlay */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.25)',
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
            }}
          >
            <Text fontSize="$6" color="white">
              ▶
            </Text>
          </View>
          {isNew ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 6,
                backgroundColor: colors.primary,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text color="white" fontSize={10} fontWeight="700">
                NEW
              </Text>
            </View>
          ) : null}
          {item.featured ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                backgroundColor: colors.accent,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text color="white" fontSize={10} fontWeight="700">
                ★
              </Text>
            </View>
          ) : null}
        </YStack>
      </Pressable>

      <YStack padding="$2" gap="$1" flex={1}>
        <Text color={colors.text} fontSize="$2" fontWeight="600" numberOfLines={2}>
          {item.title}
        </Text>
        {item.album ? (
          <Text color={colors.textMuted} fontSize={11} numberOfLines={1}>
            {item.album}
          </Text>
        ) : null}
        {item.type === 'podcast' && item.host ? (
          <Text color={colors.textMuted} fontSize={11} numberOfLines={1}>
            {item.host}
            {item.guest ? ` ft. ${item.guest}` : ''}
          </Text>
        ) : null}
        {item.type === 'sermon' && item.preacher ? (
          <Text color={colors.textMuted} fontSize={11} numberOfLines={1}>
            {item.preacher}
          </Text>
        ) : null}
        {item.year ? (
          <Text color={colors.textMuted} fontSize={11}>
            {item.year}
          </Text>
        ) : null}
      </YStack>

      {buildMode ? (
        <XStack
          borderTopWidth={1}
          borderTopColor={colors.border}
          padding="$1"
          justifyContent="space-between"
        >
          <Pressable onPress={() => onEdit(item)}>
            <Text color={colors.primary} fontSize="$2" paddingHorizontal="$2">
              Edit
            </Text>
          </Pressable>
          <Pressable onPress={() => onDelete(item.id)}>
            <Text color="#c0392b" fontSize="$2" paddingHorizontal="$2">
              Delete
            </Text>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  )
}

const SECTION_PREVIEW = 8

function Section({
  title,
  items,
  onPlay,
  onEdit,
  onDelete,
  onSeeAll,
  buildMode,
}: {
  title: string
  items: MusicItem[]
  onPlay: (item: MusicItem) => void
  onEdit: (item: MusicItem) => void
  onDelete: (id: string) => void
  onSeeAll: () => void
  buildMode: boolean
}) {
  const colors = useThemeColors()
  if (items.length === 0) return null
  const preview = items.slice(0, SECTION_PREVIEW)
  return (
    <YStack gap="$2" marginBottom="$4">
      <XStack paddingHorizontal="$4" alignItems="center" justifyContent="space-between">
        <Text color={colors.text} fontSize="$5" fontWeight="700">
          {title}
        </Text>
        <Pressable onPress={onSeeAll}>
          <Text color={colors.primary} fontSize="$3" fontWeight="600">
            See All ({items.length}) →
          </Text>
        </Pressable>
      </XStack>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
      >
        {preview.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            onPlay={onPlay}
            onEdit={onEdit}
            onDelete={onDelete}
            buildMode={buildMode}
          />
        ))}
        {items.length > SECTION_PREVIEW ? (
          <Pressable onPress={onSeeAll}>
            <YStack
              width={120}
              height={120}
              backgroundColor={colors.surface}
              borderRadius="$3"
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
              justifyContent="center"
              gap="$1"
            >
              <Text color={colors.primary} fontSize="$5" fontWeight="700">
                +{items.length - SECTION_PREVIEW}
              </Text>
              <Text color={colors.textMuted} fontSize="$2">
                more
              </Text>
            </YStack>
          </Pressable>
        ) : null}
      </ScrollView>
    </YStack>
  )
}

interface EditForm {
  type: MusicItem['type']
  title: string
  youtubeUrl: string
  album: string
  year: string
  month: string
  host: string
  guest: string
  preacher: string
  featured: boolean
  isNew: boolean
  newUntil: string
}

const BLANK_FORM: EditForm = {
  type: 'music',
  title: '',
  youtubeUrl: '',
  album: '',
  year: '',
  month: '',
  host: '',
  guest: '',
  preacher: 'Pastor Ajai Prakash',
  featured: false,
  isNew: false,
  newUntil: '',
}

function formToItem(form: EditForm, id: string): MusicItem {
  return {
    id,
    type: form.type,
    title: form.title.trim(),
    youtubeUrl: form.youtubeUrl.trim(),
    album: form.album.trim() || undefined,
    year: form.year ? parseInt(form.year, 10) : undefined,
    month: form.month ? parseInt(form.month, 10) : undefined,
    host: form.host.trim() || undefined,
    guest: form.guest.trim() || undefined,
    preacher: form.preacher.trim() || undefined,
    featured: form.featured,
    isNew: form.isNew,
    newUntil: form.newUntil.trim() || undefined,
  }
}

function itemToForm(item: MusicItem): EditForm {
  return {
    type: item.type,
    title: item.title,
    youtubeUrl: item.youtubeUrl,
    album: item.album ?? '',
    year: item.year?.toString() ?? '',
    month: item.month?.toString() ?? '',
    host: item.host ?? '',
    guest: item.guest ?? '',
    preacher: item.preacher ?? 'Pastor Ajai Prakash',
    featured: item.featured ?? false,
    isNew: item.isNew ?? false,
    newUntil: item.newUntil ?? '',
  }
}

export default function MusicScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)
  const { items, loading, load, addItem, updateItem, deleteItem } = useMusicStore()

  const [buildMode, setBuildMode] = useState(false)
  const [playingItem, setPlayingItem] = useState<MusicItem | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // null = new
  const [showEditModal, setShowEditModal] = useState(false)
  const [form, setForm] = useState<EditForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [seeAllSection, setSeeAllSection] = useState<{ title: string; items: MusicItem[] } | null>(
    null
  )
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>(DEFAULT_SCOPE)
  const [scopeOpen, setScopeOpen] = useState(false)

  useEffect(() => {
    load().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Searching replaces the rows rather than filtering each one: a result
  // belongs to whichever row it came from, and repeating the same video under
  // three headings answers the question worse than one list does.
  // A kind — Podcasts only, say — narrows the library on its own, so it counts
  // as searching even with nothing typed.
  const searching =
    query.trim() !== '' || scope === 'music' || scope === 'podcast' || scope === 'sermon'
  const results = searchMusic(items, query, scope)

  const newItems = items.filter(isItemNew)
  const featuredItems = items.filter((i) => i.featured && !isItemNew(i))
  const musicItems = items.filter((i) => i.type === 'music')
  const podcastItems = items.filter((i) => i.type === 'podcast')
  const sermonItems = items.filter((i) => i.type === 'sermon')

  const openAdd = () => {
    setEditingId(null)
    setForm(BLANK_FORM)
    setShowEditModal(true)
  }

  const openEdit = (item: MusicItem) => {
    setEditingId(item.id)
    setForm(itemToForm(item))
    setShowEditModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.youtubeUrl.trim()) {
      toast('Title and YouTube URL are required', 'error')
      return
    }
    if (!extractYouTubeId(form.youtubeUrl)) {
      toast('Invalid YouTube URL', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateItem(editingId, formToItem(form, editingId))
        toast('Updated', 'success')
      } else {
        await addItem(formToItem(form, nanoid()))
        toast('Added', 'success')
      }
      setShowEditModal(false)
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id)
      toast('Deleted', 'info')
    } catch {
      toast('Delete failed', 'error')
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Content' }} />

      {/* Admin toolbar */}
      {admin ? (
        <XStack
          padding="$2"
          gap="$2"
          justifyContent="flex-end"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          {buildMode ? (
            <Pressable onPress={openAdd}>
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$1"
                borderRadius="$2"
                backgroundColor={colors.primary}
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  + Add Item
                </Text>
              </XStack>
            </Pressable>
          ) : null}
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

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading…</Text>
        </YStack>
      ) : items.length === 0 && !buildMode ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
          <Text color={colors.textMuted} textAlign="center" fontSize="$4">
            No content yet.{admin ? ' Switch to Build Mode to add items.' : ''}
          </Text>
        </YStack>
      ) : (
        <>
          {/* Fixed above the list rather than scrolling with it: the reason to
            search is that the thing being looked for is somewhere further
            down, and a bar that scrolls away is one more thing to go back
            for. */}
          <XStack
            paddingHorizontal="$4"
            paddingTop="$2"
            paddingBottom="$1"
            alignItems="center"
            gap="$2"
          >
            <TextInput
              style={[
                styles.search,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${scopeLabel(scope).toLowerCase()}…`}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {/* What the search looks at. Titles by default: searching every
                field at once turns a year into every title containing those
                digits, and a name into every episode of that person's series. */}
            <Pressable onPress={() => setScopeOpen((v) => !v)} accessibilityLabel="Search in">
              <XStack
                alignItems="center"
                gap="$1"
                borderWidth={1}
                borderColor={scope === DEFAULT_SCOPE ? colors.border : colors.primary}
                borderRadius="$2"
                paddingHorizontal="$2"
                paddingVertical="$2"
              >
                <Text
                  color={scope === DEFAULT_SCOPE ? colors.textMuted : colors.primary}
                  fontSize="$2"
                  fontWeight="600"
                >
                  {scopeLabel(scope)}
                </Text>
                <Text
                  color={scope === DEFAULT_SCOPE ? colors.textMuted : colors.primary}
                  fontSize="$1"
                >
                  ▾
                </Text>
              </XStack>
            </Pressable>

            {query !== '' ? (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Text color={colors.textMuted} fontSize="$3">
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </XStack>

          {scopeOpen ? (
            <YStack
              marginHorizontal="$4"
              marginBottom="$2"
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$3"
              overflow="hidden"
            >
              {SEARCH_SCOPES.map((option) => {
                const active = option.value === scope
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setScope(option.value)
                      setScopeOpen(false)
                    }}
                  >
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$3"
                      backgroundColor={active ? colors.primary + '18' : 'transparent'}
                      borderBottomWidth={1}
                      borderBottomColor={colors.border}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Text
                        color={active ? colors.primary : colors.text}
                        fontSize="$3"
                        fontWeight={active ? '700' : '400'}
                      >
                        {option.label}
                      </Text>
                      {active ? (
                        <Text color={colors.primary} fontSize="$3">
                          ✓
                        </Text>
                      ) : null}
                    </XStack>
                  </Pressable>
                )
              })}
            </YStack>
          ) : null}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16 }}>
            {searching ? (
              results.length > 0 ? (
                <Section
                  title={`Results (${results.length})`}
                  items={results}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() =>
                    setSeeAllSection({ title: `Results for “${query.trim()}”`, items: results })
                  }
                  buildMode={buildMode}
                />
              ) : (
                <YStack padding="$6" alignItems="center">
                  <Text color={colors.textMuted} fontSize="$3" textAlign="center">
                    Nothing matches “{query.trim()}”.
                  </Text>
                </YStack>
              )
            ) : (
              <>
                <Section
                  title="New"
                  items={newItems}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() => setSeeAllSection({ title: 'New', items: newItems })}
                  buildMode={buildMode}
                />
                <Section
                  title="Featured"
                  items={featuredItems}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() => setSeeAllSection({ title: 'Featured', items: featuredItems })}
                  buildMode={buildMode}
                />
                <Section
                  title="Music"
                  items={musicItems}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() => setSeeAllSection({ title: 'Music', items: musicItems })}
                  buildMode={buildMode}
                />
                <Section
                  title="Podcasts"
                  items={podcastItems}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() => setSeeAllSection({ title: 'Podcasts', items: podcastItems })}
                  buildMode={buildMode}
                />
                <Section
                  title="Sermons"
                  items={sermonItems}
                  onPlay={setPlayingItem}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSeeAll={() => setSeeAllSection({ title: 'Sermons', items: sermonItems })}
                  buildMode={buildMode}
                />
              </>
            )}

            {/* Build mode: full list for editing */}
            {buildMode && items.length > 0 ? (
              <YStack paddingHorizontal="$4" gap="$2" marginTop="$2">
                <Text color={colors.text} fontSize="$4" fontWeight="700" marginBottom="$2">
                  All Items
                </Text>
                {items.map((item) => (
                  <XStack
                    key={item.id}
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    padding="$3"
                    gap="$3"
                    alignItems="center"
                  >
                    <Thumbnail url={item.youtubeUrl} size={72} />
                    <YStack flex={1} gap="$1">
                      <Text color={colors.text} fontSize="$3" fontWeight="600" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        {TYPE_LABELS[item.type]}
                        {item.featured ? ' · Featured' : ''}
                        {isItemNew(item) ? ' · New' : ''}
                      </Text>
                    </YStack>
                    <XStack gap="$2">
                      <Pressable onPress={() => openEdit(item)}>
                        <Text color={colors.primary} fontSize="$3">
                          Edit
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(item.id)}>
                        <Text color="#c0392b" fontSize="$3">
                          Delete
                        </Text>
                      </Pressable>
                    </XStack>
                  </XStack>
                ))}
              </YStack>
            ) : null}
          </ScrollView>
        </>
      )}

      {/* Play modal */}
      <Modal
        visible={!!playingItem}
        animationType="slide"
        onRequestClose={() => setPlayingItem(null)}
      >
        <View style={[styles.playModal, { backgroundColor: '#000' }]}>
          <Pressable onPress={() => setPlayingItem(null)} style={styles.closeBtn}>
            <Text color="white" fontSize="$5" fontWeight="700">
              ✕
            </Text>
          </Pressable>
          {playingItem ? (
            <YStack flex={1} gap="$2">
              <View style={{ flex: 1 }}>
                <YouTubeEmbed url={playingItem.youtubeUrl} />
              </View>
              <YStack padding="$4">
                <Text color="white" fontSize="$4" fontWeight="700">
                  {playingItem.title}
                </Text>
                {playingItem.album ? (
                  <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                    {playingItem.album}
                  </Text>
                ) : null}
              </YStack>
            </YStack>
          ) : null}
        </View>
      </Modal>

      {/* See All modal */}
      <Modal
        visible={!!seeAllSection}
        animationType="slide"
        onRequestClose={() => setSeeAllSection(null)}
      >
        <View style={[styles.editModal, { backgroundColor: colors.background }]}>
          <XStack
            padding="$4"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
            alignItems="center"
            justifyContent="space-between"
          >
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              {seeAllSection?.title ?? ''}
            </Text>
            <Pressable onPress={() => setSeeAllSection(null)}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            <YStack gap="$3">
              {(seeAllSection?.items ?? []).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setSeeAllSection(null)
                    setPlayingItem(item)
                  }}
                >
                  <XStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    overflow="hidden"
                  >
                    <Thumbnail url={item.youtubeUrl} size={96} />
                    <YStack flex={1} padding="$3" gap="$1" justifyContent="center">
                      <Text color={colors.text} fontSize="$3" fontWeight="600" numberOfLines={2}>
                        {item.title}
                      </Text>
                      {item.album ? (
                        <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                          {item.album}
                        </Text>
                      ) : null}
                      {item.type === 'podcast' && item.host ? (
                        <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                          {item.host}
                          {item.guest ? ` ft. ${item.guest}` : ''}
                        </Text>
                      ) : null}
                      {item.type === 'sermon' && item.preacher ? (
                        <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                          {item.preacher}
                        </Text>
                      ) : null}
                      {item.year ? (
                        <Text color={colors.textMuted} fontSize={11}>
                          {item.year}
                        </Text>
                      ) : null}
                    </YStack>
                    <YStack alignItems="center" justifyContent="center" paddingRight="$3">
                      <Text color={colors.primary} fontSize="$5">
                        ▶
                      </Text>
                    </YStack>
                  </XStack>
                </Pressable>
              ))}
            </YStack>
          </ScrollView>
        </View>
      </Modal>

      {/* Add/Edit modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={[styles.editModal, { backgroundColor: colors.background }]}>
          <XStack
            padding="$4"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
            alignItems="center"
            justifyContent="space-between"
          >
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              {editingId ? 'Edit Item' : 'Add Item'}
            </Text>
            <Pressable onPress={() => setShowEditModal(false)}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Type picker */}
            <Text style={[styles.label, { color: colors.textMuted }]}>Type</Text>
            <XStack gap="$2" marginBottom="$3">
              {(['music', 'podcast', 'sermon'] as MusicItem['type'][]).map((t) => (
                <Pressable key={t} onPress={() => setForm((f) => ({ ...f, type: t }))}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$2"
                    borderWidth={1}
                    backgroundColor={form.type === t ? colors.primary : 'transparent'}
                    borderColor={form.type === t ? colors.primary : colors.border}
                  >
                    <Text
                      color={form.type === t ? 'white' : colors.text}
                      fontSize="$3"
                      fontWeight="600"
                    >
                      {TYPE_LABELS[t]}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>

            <Text style={[styles.label, { color: colors.textMuted }]}>Title *</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>YouTube URL *</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={form.youtubeUrl}
              onChangeText={(v) => setForm((f) => ({ ...f, youtubeUrl: v }))}
              placeholder="https://youtu.be/..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Album / Series</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={form.album}
              onChangeText={(v) => setForm((f) => ({ ...f, album: v }))}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Year</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={form.year}
              onChangeText={(v) => setForm((f) => ({ ...f, year: v }))}
              placeholder="2024"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Month (1–12)</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={form.month}
              onChangeText={(v) => setForm((f) => ({ ...f, month: v }))}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            {form.type === 'podcast' ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>Host</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  value={form.host}
                  onChangeText={(v) => setForm((f) => ({ ...f, host: v }))}
                  placeholder="Host name"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={[styles.label, { color: colors.textMuted }]}>Guest</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  value={form.guest}
                  onChangeText={(v) => setForm((f) => ({ ...f, guest: v }))}
                  placeholder="Guest name (optional)"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            ) : null}

            {form.type === 'sermon' ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>Preacher</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  value={form.preacher}
                  onChangeText={(v) => setForm((f) => ({ ...f, preacher: v }))}
                  placeholder="Preacher name"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            ) : null}

            {/* Toggles */}
            <XStack gap="$4" marginTop="$2">
              <Pressable onPress={() => setForm((f) => ({ ...f, featured: !f.featured }))}>
                <XStack gap="$2" alignItems="center">
                  <View
                    style={[
                      styles.toggle,
                      {
                        backgroundColor: form.featured ? colors.primary : colors.surface,
                        borderColor: form.featured ? colors.primary : colors.border,
                      },
                    ]}
                  />
                  <Text color={colors.text} fontSize="$3">
                    Featured
                  </Text>
                </XStack>
              </Pressable>

              <Pressable onPress={() => setForm((f) => ({ ...f, isNew: !f.isNew }))}>
                <XStack gap="$2" alignItems="center">
                  <View
                    style={[
                      styles.toggle,
                      {
                        backgroundColor: form.isNew ? colors.primary : colors.surface,
                        borderColor: form.isNew ? colors.primary : colors.border,
                      },
                    ]}
                  />
                  <Text color={colors.text} fontSize="$3">
                    Mark as New
                  </Text>
                </XStack>
              </Pressable>
            </XStack>

            {form.isNew ? (
              <YStack marginTop="$2" gap="$1">
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  New Until (YYYY-MM-DD)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  value={form.newUntil}
                  onChangeText={(v) => setForm((f) => ({ ...f, newUntil: v }))}
                  placeholder="Leave blank to always show as new"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </YStack>
            ) : null}
          </ScrollView>

          <XStack
            padding="$4"
            borderTopWidth={1}
            borderTopColor={colors.border}
            gap="$3"
            justifyContent="flex-end"
          >
            <Pressable onPress={() => setShowEditModal(false)}>
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$2"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.text} fontSize="$3">
                  Cancel
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving}>
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$2"
                backgroundColor={colors.primary}
                opacity={saving ? 0.6 : 1}
              >
                <Text color="white" fontSize="$3" fontWeight="600">
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </View>
      </Modal>
    </YStack>
  )
}

const styles = StyleSheet.create({
  search: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  playModal: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  editModal: {
    flex: 1,
    paddingTop: 48,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 4,
  },
  toggle: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
  },
})
