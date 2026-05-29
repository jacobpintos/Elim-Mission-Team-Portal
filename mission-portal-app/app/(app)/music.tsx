import { useEffect, useState } from 'react'
import { ScrollView, TextInput, Pressable, StyleSheet, Platform, Modal, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMusicStore, extractYouTubeId, youtubeThumbnail } from '@/stores/musicStore'
import type { MusicItem } from '@/stores/musicStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { useUIStore } from '@/stores/uiStore'

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
  const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1`

  if (Platform.OS === 'web') {
    return (
      <iframe
        src={embedUrl}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }
  // Native: dynamic import of WebView to avoid web bundle errors
  const { WebView } = require('react-native-webview')
  return (
    <WebView
      source={{ uri: embedUrl }}
      style={{ flex: 1 }}
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
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
  if (Platform.OS === 'web') {
    return (
      <img
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
  const { Image } = require('react-native')
  return (
    <Image
      source={{ uri: thumb }}
      style={{ width: size, height: Math.round(size * 0.56), borderRadius: 6 }}
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
            <Text fontSize="$6" color="white">▶</Text>
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
              <Text color="white" fontSize={10} fontWeight="700">NEW</Text>
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
              <Text color="white" fontSize={10} fontWeight="700">★</Text>
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
            <Text color={colors.primary} fontSize="$2" paddingHorizontal="$2">Edit</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(item.id)}>
            <Text color="#c0392b" fontSize="$2" paddingHorizontal="$2">Delete</Text>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  )
}

function Section({
  title,
  items,
  onPlay,
  onEdit,
  onDelete,
  buildMode,
}: {
  title: string
  items: MusicItem[]
  onPlay: (item: MusicItem) => void
  onEdit: (item: MusicItem) => void
  onDelete: (id: string) => void
  buildMode: boolean
}) {
  const colors = useThemeColors()
  if (items.length === 0) return null
  return (
    <YStack gap="$2" marginBottom="$4">
      <Text
        color={colors.text}
        fontSize="$5"
        fontWeight="700"
        paddingHorizontal="$4"
      >
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
      >
        {items.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            onPlay={onPlay}
            onEdit={onEdit}
            onDelete={onDelete}
            buildMode={buildMode}
          />
        ))}
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

  useEffect(() => {
    load().catch(() => {})
  }, [])

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
      <Stack.Screen options={{ title: 'Content' }} />

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
                <Text color="white" fontSize="$2" fontWeight="600">+ Add Item</Text>
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16 }}>
          <Section
            title="New"
            items={newItems}
            onPlay={setPlayingItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            buildMode={buildMode}
          />
          <Section
            title="Featured"
            items={featuredItems}
            onPlay={setPlayingItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            buildMode={buildMode}
          />
          <Section
            title="Music"
            items={musicItems}
            onPlay={setPlayingItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            buildMode={buildMode}
          />
          <Section
            title="Podcasts"
            items={podcastItems}
            onPlay={setPlayingItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            buildMode={buildMode}
          />
          <Section
            title="Sermons"
            items={sermonItems}
            onPlay={setPlayingItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            buildMode={buildMode}
          />

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
                      <Text color={colors.primary} fontSize="$3">Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(item.id)}>
                      <Text color="#c0392b" fontSize="$3">Delete</Text>
                    </Pressable>
                  </XStack>
                </XStack>
              ))}
            </YStack>
          ) : null}
        </ScrollView>
      )}

      {/* Play modal */}
      <Modal
        visible={!!playingItem}
        animationType="slide"
        onRequestClose={() => setPlayingItem(null)}
      >
        <View style={[styles.playModal, { backgroundColor: '#000' }]}>
          <Pressable onPress={() => setPlayingItem(null)} style={styles.closeBtn}>
            <Text color="white" fontSize="$5" fontWeight="700">✕</Text>
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
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
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
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>YouTube URL *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={form.youtubeUrl}
              onChangeText={(v) => setForm((f) => ({ ...f, youtubeUrl: v }))}
              placeholder="https://youtu.be/..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Album / Series</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={form.album}
              onChangeText={(v) => setForm((f) => ({ ...f, album: v }))}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Year</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={form.year}
              onChangeText={(v) => setForm((f) => ({ ...f, year: v }))}
              placeholder="2024"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

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
                  <Text color={colors.text} fontSize="$3">Featured</Text>
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
                  <Text color={colors.text} fontSize="$3">Mark as New</Text>
                </XStack>
              </Pressable>
            </XStack>

            {form.isNew ? (
              <YStack marginTop="$2" gap="$1">
                <Text style={[styles.label, { color: colors.textMuted }]}>New Until (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
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
                <Text color={colors.text} fontSize="$3">Cancel</Text>
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
