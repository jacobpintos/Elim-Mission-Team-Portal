import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput as RNTextInput, Platform, Linking } from 'react-native'
import { YStack, XStack, Text, Image } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMusicStore } from '@/stores/musicStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { Modal } from '@/components/ui/Modal'
import { extractYouTubeId, youtubeThumbnail } from '@/lib/media'
import type { MusicItem } from '@/types/music'

type ContentType = 'music' | 'podcast' | 'sermon'
const TYPE_LABELS: Record<ContentType, string> = { music: 'Music', podcast: 'Podcast', sermon: 'Sermon' }

function makeEmpty(): Omit<MusicItem, 'id'> {
  return { type: 'music', title: '', youtubeUrl: '', featured: false, isNew: false, newDays: 30 }
}

export default function MusicScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = useMusicStore()
  const toast = useUIStore((s) => s.toast)
  const admin = isAdmin(profile)

  const [buildMode, setBuildMode] = useState(false)
  const [query, setQuery] = useState('')
  const [playItem, setPlayItem] = useState<MusicItem | null>(null)
  const [editItem, setEditItem] = useState<Partial<MusicItem> & { id?: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [seeAllType, setSeeAllType] = useState<ContentType | null>(null)

  useEffect(() => {
    store.loadItems().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = Date.now()
  const { items } = store

  const newItems = items.filter((i) => i.isNew && i.newUntil && new Date(i.newUntil).getTime() >= now)
  const featured = items.filter((i) => i.featured)
  const music = items.filter((i) => i.type === 'music')
  const podcasts = items.filter((i) => i.type === 'podcast')
  const sermons = items.filter((i) => i.type === 'sermon')

  const searchResults = query.trim()
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(query.toLowerCase()) ||
          (i.album ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : []

  function openPlay(item: MusicItem) {
    setPlayItem(item)
  }

  async function handleSave() {
    if (!editItem) return
    if (!editItem.title?.trim() || !editItem.youtubeUrl?.trim()) {
      toast('Title and YouTube URL are required.', 'error')
      return
    }
    setSaving(true)
    try {
      if (editItem.id !== undefined) {
        await store.updateItem(editItem.id, editItem as Partial<MusicItem>)
      } else {
        await store.addItem(editItem as Omit<MusicItem, 'id'>)
      }
      setEditItem(null)
      toast('Saved.', 'success')
    } catch {
      toast('Failed to save.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this item?')) return
    }
    await store.deleteItem(id).catch(() => {})
    toast('Deleted.', 'info')
  }

  const previewThumb = editItem?.youtubeUrl ? youtubeThumbnail(editItem.youtubeUrl) : null

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Content' }} />

      {admin && !buildMode && (
        <XStack justifyContent="flex-end" padding="$2" borderBottomWidth={1} borderBottomColor={colors.border}>
          <Pressable onPress={() => setBuildMode(true)}>
            <XStack borderWidth={1} borderColor={colors.border} paddingHorizontal="$3" paddingVertical="$1" borderRadius="$2">
              <Text color={colors.text} fontSize="$2">✎ Build Mode</Text>
            </XStack>
          </Pressable>
        </XStack>
      )}

      {admin && buildMode && (
        <XStack justifyContent="space-between" padding="$2" borderBottomWidth={1} borderBottomColor={colors.border} backgroundColor={colors.primary + '11'}>
          <Pressable onPress={() => setEditItem(makeEmpty())}>
            <XStack backgroundColor={colors.primary} paddingHorizontal="$3" paddingVertical="$1" borderRadius="$2">
              <Text color="#fff" fontWeight="700">+ Add Song / Podcast</Text>
            </XStack>
          </Pressable>
          <Pressable onPress={() => setBuildMode(false)}>
            <Text color={colors.primary} fontSize="$2">✎ Build Mode ON</Text>
          </Pressable>
        </XStack>
      )}

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$4">
          {/* Header */}
          <YStack gap="$1">
            <Text color={colors.accent} fontSize="$7" fontWeight="800">Content</Text>
            <Text color={colors.textMuted} fontSize="$3">Music, podcasts, and sermons from The Well of Iowa</Text>
          </YStack>

          {/* Search */}
          <RNTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor={colors.textMuted}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surface }}
          />

          {/* Search results */}
          {query.trim() ? (
            searchResults.length === 0 ? (
              <Text color={colors.textMuted} textAlign="center" padding="$4">No results found.</Text>
            ) : (
              (['music', 'podcast', 'sermon'] as ContentType[]).map((type) => {
                const group = searchResults.filter((i) => i.type === type)
                if (group.length === 0) return null
                return (
                  <YStack key={type} gap="$2">
                    <Text color={colors.accent} fontWeight="700">{TYPE_LABELS[type]}</Text>
                    {group.map((item) => (
                      <Pressable key={item.id} onPress={() => openPlay(item)}>
                        <XStack gap="$2" alignItems="center" backgroundColor={colors.surface} borderRadius="$2" padding="$2" borderWidth={1} borderColor={colors.border}>
                          {item.thumbnail ? (
                            <Image source={{ uri: item.thumbnail }} width={48} height={48} borderRadius="$1" resizeMode="cover" />
                          ) : <YStack width={48} height={48} backgroundColor={colors.border} borderRadius="$1" />}
                          <YStack flex={1}>
                            <Text color={colors.text} fontWeight="700" fontSize="$3" numberOfLines={1}>{item.title}</Text>
                            <Text color={colors.textMuted} fontSize="$2">{item.album ?? ''}</Text>
                          </YStack>
                        </XStack>
                      </Pressable>
                    ))}
                  </YStack>
                )
              })
            )
          ) : buildMode ? (
            /* Build mode list */
            <YStack gap="$2">
              {items.map((item) => (
                <XStack key={item.id} gap="$2" alignItems="center" backgroundColor={colors.surface} borderRadius="$2" padding="$2" borderWidth={1} borderColor={colors.border}>
                  {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} width={48} height={48} borderRadius="$1" resizeMode="cover" />
                  ) : <YStack width={48} height={48} backgroundColor={colors.border} borderRadius="$1" />}
                  <YStack flex={1}>
                    <XStack gap="$1" alignItems="center">
                      <Text color={colors.text} fontWeight="700" fontSize="$3" numberOfLines={1}>{item.title}</Text>
                      <XStack backgroundColor={colors.primary + '22'} paddingHorizontal="$1" borderRadius="$1">
                        <Text color={colors.primary} fontSize="$1">{item.type.toUpperCase()}</Text>
                      </XStack>
                      {item.isNew && item.newUntil && new Date(item.newUntil).getTime() >= now && (
                        <XStack backgroundColor="#e74c3c" paddingHorizontal="$1" borderRadius="$1">
                          <Text color="#fff" fontSize="$1">NEW</Text>
                        </XStack>
                      )}
                    </XStack>
                    <Text color={colors.textMuted} fontSize="$2">{item.album ?? ''}{item.year ? ` · ${item.year}` : ''}</Text>
                  </YStack>
                  <XStack gap="$2">
                    <Pressable onPress={() => setEditItem({ ...item })}>
                      <Text color={colors.primary}>✎</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(item.id)}>
                      <Text color="#c0392b">✕</Text>
                    </Pressable>
                  </XStack>
                </XStack>
              ))}
              {items.length === 0 && <Text color={colors.textMuted} textAlign="center">No content yet.</Text>}
            </YStack>
          ) : (
            /* Browse rows */
            <>
              {seeAllType ? (
                <SeeAllView
                  type={seeAllType}
                  items={items.filter((i) => i.type === seeAllType)}
                  colors={colors}
                  now={now}
                  onPlay={openPlay}
                  onBack={() => setSeeAllType(null)}
                />
              ) : (
                <>
                  {newItems.length > 0 && (
                    <ContentRow label="🔥 New" items={newItems} now={now} colors={colors} onPlay={openPlay} />
                  )}
                  {featured.length > 0 && (
                    <ContentRow label="Featured" items={featured} now={now} colors={colors} onPlay={openPlay} />
                  )}
                  {music.length > 0 && (
                    <ContentRow label="Music" items={music} now={now} colors={colors} onPlay={openPlay} onSeeAll={() => setSeeAllType('music')} />
                  )}
                  {podcasts.length > 0 && (
                    <ContentRow label="Podcasts" items={podcasts} now={now} colors={colors} onPlay={openPlay} onSeeAll={() => setSeeAllType('podcast')} />
                  )}
                  {sermons.length > 0 && (
                    <ContentRow label="Sermons" items={sermons} now={now} colors={colors} onPlay={openPlay} onSeeAll={() => setSeeAllType('sermon')} />
                  )}
                  {items.length === 0 && (
                    <Text color={colors.textMuted} textAlign="center" padding="$6">No content yet.</Text>
                  )}
                </>
              )}
            </>
          )}
        </YStack>
      </ScrollView>

      {/* Play modal */}
      <Modal open={!!playItem} onOpenChange={(o) => { if (!o) setPlayItem(null) }} title={playItem?.title ?? ''}>
        {playItem && <PlayContent item={playItem} colors={colors} />}
      </Modal>

      {/* Edit/Add song modal */}
      <Modal
        open={!!editItem}
        onOpenChange={(o) => { if (!o) setEditItem(null) }}
        title={editItem?.id !== undefined ? 'Edit Song' : 'Add Song'}
      >
        {editItem && (
          <ScrollView>
            <YStack gap="$3" paddingBottom="$4">
              {/* Type toggle */}
              <XStack gap="$1">
                {(['music', 'podcast', 'sermon'] as ContentType[]).map((t) => (
                  <Pressable key={t} style={{ flex: 1 }} onPress={() => setEditItem({ ...editItem, type: t })}>
                    <YStack
                      padding="$2"
                      alignItems="center"
                      borderRadius="$2"
                      backgroundColor={editItem.type === t ? colors.primary : colors.surface}
                      borderWidth={1}
                      borderColor={editItem.type === t ? colors.primary : colors.border}
                    >
                      <Text color={editItem.type === t ? '#fff' : colors.text} fontSize="$2" fontWeight="700">
                        {TYPE_LABELS[t]}
                      </Text>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">
                  {editItem.type === 'sermon' ? 'Sermon Title' : editItem.type === 'podcast' ? 'Episode Title' : 'Song Title'} *
                </Text>
                <RNTextInput
                  value={editItem.title ?? ''}
                  onChangeText={(v) => setEditItem({ ...editItem, title: v })}
                  placeholder="Title"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">YouTube URL *</Text>
                <RNTextInput
                  value={editItem.youtubeUrl ?? ''}
                  onChangeText={(v) => setEditItem({ ...editItem, youtubeUrl: v })}
                  placeholder="https://youtube.com/watch?v=..."
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
                {previewThumb && (
                  <Image source={{ uri: previewThumb }} width={120} height={68} borderRadius="$1" resizeMode="cover" />
                )}
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">
                  {editItem.type === 'sermon' ? 'Series' : editItem.type === 'podcast' ? 'Podcast Name' : 'Album'} (optional)
                </Text>
                <RNTextInput
                  value={editItem.album ?? ''}
                  onChangeText={(v) => setEditItem({ ...editItem, album: v })}
                  placeholder="Album / series"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Year (optional)</Text>
                <RNTextInput
                  value={editItem.year ?? ''}
                  onChangeText={(v) => setEditItem({ ...editItem, year: v })}
                  placeholder="2024"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              <XStack gap="$3">
                <XStack gap="$2" alignItems="center">
                  <Pressable onPress={() => setEditItem({ ...editItem, featured: !editItem.featured })}>
                    <XStack width={20} height={20} borderWidth={1} borderColor={colors.border} borderRadius="$1" backgroundColor={editItem.featured ? colors.primary : 'transparent'} alignItems="center" justifyContent="center">
                      {editItem.featured && <Text color="#fff" fontSize="$1">✓</Text>}
                    </XStack>
                  </Pressable>
                  <Text color={colors.text} fontSize="$3">Featured</Text>
                </XStack>

                <XStack gap="$2" alignItems="center">
                  <Pressable onPress={() => setEditItem({ ...editItem, isNew: !editItem.isNew })}>
                    <XStack width={20} height={20} borderWidth={1} borderColor={colors.border} borderRadius="$1" backgroundColor={editItem.isNew ? colors.primary : 'transparent'} alignItems="center" justifyContent="center">
                      {editItem.isNew && <Text color="#fff" fontSize="$1">✓</Text>}
                    </XStack>
                  </Pressable>
                  <Text color={colors.text} fontSize="$3">Mark as New</Text>
                </XStack>
              </XStack>

              {editItem.isNew && (
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2">Show as New for (days)</Text>
                  <RNTextInput
                    value={String(editItem.newDays ?? 30)}
                    onChangeText={(v) => setEditItem({ ...editItem, newDays: parseInt(v) || 30 })}
                    keyboardType="number-pad"
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface, width: 100 }}
                  />
                </YStack>
              )}

              <XStack gap="$2">
                <Pressable style={{ flex: 1 }} onPress={() => setEditItem(null)}>
                  <XStack borderWidth={1} borderColor={colors.border} padding="$2" borderRadius="$2" justifyContent="center">
                    <Text color={colors.text}>Cancel</Text>
                  </XStack>
                </Pressable>
                <Pressable style={{ flex: 2 }} onPress={handleSave} disabled={saving}>
                  <XStack backgroundColor={colors.primary} padding="$2" borderRadius="$2" justifyContent="center" opacity={saving ? 0.6 : 1}>
                    <Text color="#fff" fontWeight="700">{saving ? 'Saving…' : 'Save'}</Text>
                  </XStack>
                </Pressable>
              </XStack>
            </YStack>
          </ScrollView>
        )}
      </Modal>
    </YStack>
  )
}

function ContentRow({
  label, items, now, colors, onPlay, onSeeAll,
}: {
  label: string
  items: MusicItem[]
  now: number
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
  onPlay: (item: MusicItem) => void
  onSeeAll?: () => void
}) {
  const visible = items.slice(0, 6)
  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="center">
        <Text color={colors.accent} fontWeight="700" fontSize="$4">{label}</Text>
        {onSeeAll && items.length > 6 && (
          <Pressable onPress={onSeeAll}>
            <Text color={colors.primary} fontSize="$2">See All</Text>
          </Pressable>
        )}
      </XStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {visible.map((item) => (
            <MusicCard key={item.id} item={item} now={now} colors={colors} onPlay={onPlay} />
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  )
}

function MusicCard({
  item, now, colors, onPlay,
}: {
  item: MusicItem
  now: number
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
  onPlay: (item: MusicItem) => void
}) {
  const isCurrentlyNew = item.isNew && item.newUntil && new Date(item.newUntil).getTime() >= now
  return (
    <Pressable onPress={() => onPlay(item)}>
      <YStack width={140} gap="$1" position="relative">
        <YStack width={140} height={90} borderRadius="$2" overflow="hidden" backgroundColor={colors.border}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} width={140} height={90} resizeMode="cover" />
          ) : (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <Text fontSize="$6">🎵</Text>
            </YStack>
          )}
          {isCurrentlyNew && (
            <XStack position="absolute" top={4} right={4} backgroundColor="#e74c3c" paddingHorizontal="$1" borderRadius="$1">
              <Text color="#fff" fontSize="$1" fontWeight="700">NEW</Text>
            </XStack>
          )}
        </YStack>
        <Text color={colors.text} fontSize="$2" fontWeight="700" numberOfLines={2}>{item.title}</Text>
        {item.album && <Text color={colors.textMuted} fontSize="$1" numberOfLines={1}>{item.album}</Text>}
      </YStack>
    </Pressable>
  )
}

function SeeAllView({
  type, items, colors, now, onPlay, onBack,
}: {
  type: ContentType
  items: MusicItem[]
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
  now: number
  onPlay: (item: MusicItem) => void
  onBack: () => void
}) {
  return (
    <YStack gap="$3">
      <XStack gap="$2" alignItems="center">
        <Pressable onPress={onBack}>
          <Text color={colors.primary}>← Back</Text>
        </Pressable>
        <Text color={colors.text} fontWeight="700" fontSize="$4">{TYPE_LABELS[type]}</Text>
      </XStack>
      <XStack flexWrap="wrap" gap="$2">
        {items.map((item) => (
          <MusicCard key={item.id} item={item} now={now} colors={colors} onPlay={onPlay} />
        ))}
      </XStack>
    </YStack>
  )
}

function PlayContent({
  item, colors,
}: {
  item: MusicItem
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
}) {
  const videoId = extractYouTubeId(item.youtubeUrl)
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null
  const ytUrl = item.youtubeUrl

  if (Platform.OS === 'web') {
    return (
      <YStack gap="$3">
        <Text color={colors.textMuted} fontSize="$2">{item.album ?? ''}{item.year ? ` · ${item.year}` : ''}</Text>
        {embedUrl && (
          <YStack borderRadius="$2" overflow="hidden">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <iframe
              src={embedUrl}
              width="100%"
              height={200}
              style={{ border: 'none' }}
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </YStack>
        )}
        <Pressable onPress={() => Linking.openURL(ytUrl)}>
          <Text color={colors.primary}>Open in YouTube ↗</Text>
        </Pressable>
      </YStack>
    )
  }

  // Native: use WebView
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebView } = require('react-native-webview')
    return (
      <YStack gap="$3">
        <Text color={colors.textMuted} fontSize="$2">{item.album ?? ''}{item.year ? ` · ${item.year}` : ''}</Text>
        {embedUrl && (
          <WebView
            source={{ uri: embedUrl }}
            style={{ width: '100%', height: 200 }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
          />
        )}
        <Pressable onPress={() => Linking.openURL(ytUrl)}>
          <Text color={colors.primary}>Open in YouTube ↗</Text>
        </Pressable>
      </YStack>
    )
  } catch {
    return (
      <YStack gap="$2">
        <Text color={colors.textMuted}>{item.album ?? ''}</Text>
        <Pressable onPress={() => Linking.openURL(ytUrl)}>
          <Text color={colors.primary}>Watch on YouTube ↗</Text>
        </Pressable>
      </YStack>
    )
  }
}
