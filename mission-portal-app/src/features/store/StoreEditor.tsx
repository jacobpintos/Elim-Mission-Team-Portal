import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Text, TextArea, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { checkImageAddress } from '@/lib/imageAddress'
import { deletePageImage, pickAndUploadPageImages } from '@/lib/pageImageUpload'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import type { PageBlock } from '@/types/pages'
import {
  ELIM_STORE_LISTING,
  booksFromOurStory,
  moveItem,
  newItemId,
  type StoreContent,
  type StoreItem,
  type StoreShelf,
} from './storeContent'
import { isBundledImage, storeImageSource } from './storeImages'
import { saveStore } from './storeWrites'

/**
 * Pictures uploaded for the store that this content points at, so ones it
 * drops on save can be deleted.
 *
 * Only the store's own folder. The books shelf takes Our Story's covers, which
 * may be that page's uploads, and taking a book off the store must never
 * delete the picture Our Story is still showing.
 */
const storeUploads = (c: StoreContent) =>
  c.shelves
    .flatMap((s) => s.items.map((i) => i.image))
    .filter((u) => u.includes('/o/pages%2Fstore%2F') || u.includes('/o/pages/store/'))

function Label({ children }: { children: string }) {
  const colors = useThemeColors()
  return (
    <Text color={colors.text} fontSize={13} fontWeight="700">
      {children}
    </Text>
  )
}

function SmallButton({
  label,
  onPress,
  disabled,
  tone = 'plain',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: 'plain' | 'primary' | 'danger'
}) {
  const colors = useThemeColors()
  const bg = tone === 'primary' ? colors.primary : 'transparent'
  const fg = tone === 'primary' ? 'white' : tone === 'danger' ? '#d64545' : colors.text
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <XStack
        paddingHorizontal={12}
        paddingVertical={7}
        borderRadius={8}
        borderWidth={tone === 'primary' ? 0 : 1}
        borderColor={tone === 'danger' ? '#d6454555' : colors.border}
        backgroundColor={bg}
        opacity={disabled ? 0.5 : 1}
      >
        <Text color={fg} fontSize={13} fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )
}

/**
 * An item's photo: upload one, or paste an address.
 *
 * The featured clothing starts on photos shipped with the app, which have no
 * address to show; the field says so rather than printing their internal
 * name, and either way of replacing one works the same as for any other.
 */
function PhotoField({ image, onChange }: { image: string; onChange: (image: string) => void }) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const source = storeImageSource(image)
  const bundled = isBundledImage(image)
  const warning = bundled ? null : checkImageAddress(image)

  const choose = async () => {
    setBusy(true)
    try {
      const picked = await pickAndUploadPageImages('store')
      if (picked[0]) onChange(picked[0].url)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add that picture', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack gap={6}>
      <Label>Photo</Label>
      <XStack gap={10} alignItems="center">
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: '#f2f2f2',
          }}
        >
          {source ? (
            <Image source={source} style={{ width: 56, height: 56 }} contentFit="cover" />
          ) : null}
        </View>
        <SmallButton
          label={busy ? 'Uploading…' : source ? 'Replace photo' : 'Choose photo'}
          onPress={choose}
          disabled={busy}
          tone="primary"
        />
      </XStack>
      <Input
        size="$3"
        value={bundled ? '' : image}
        onChangeText={onChange}
        placeholder={
          bundled
            ? 'Using the store’s photo — choose or paste one to replace it'
            : 'https://… (or use Choose photo)'
        }
        autoCapitalize="none"
        autoCorrect={false}
        color={colors.text}
        backgroundColor={colors.background}
        borderColor={colors.border}
      />
      {warning ? (
        <Text fontSize={12} color="$orange10">
          {warning}
        </Text>
      ) : null}
    </YStack>
  )
}

function ItemEditor({
  item,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  item: StoreItem
  index: number
  count: number
  /** Only the fields that changed, applied to the item as it is when they land. */
  onChange: (patch: Partial<StoreItem>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const colors = useThemeColors()
  return (
    <YStack
      padding={14}
      gap={10}
      borderRadius={12}
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <XStack alignItems="center" justifyContent="space-between" gap={8} flexWrap="wrap">
        <Text color={colors.textMuted} fontSize={12} fontWeight="800" letterSpacing={1}>
          ITEM {index + 1}
        </Text>
        <XStack gap={6}>
          <SmallButton label="↑" onPress={() => onMove(-1)} disabled={index === 0} />
          <SmallButton label="↓" onPress={() => onMove(1)} disabled={index === count - 1} />
          <SmallButton label="Remove" onPress={onRemove} tone="danger" />
        </XStack>
      </XStack>
      <PhotoField image={item.image} onChange={(image) => onChange({ image })} />
      <YStack gap={6}>
        <Label>Name</Label>
        <Input
          size="$3"
          value={item.title}
          onChangeText={(title) => onChange({ title })}
          placeholder="e.g. God Is Able T-Shirt"
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      </YStack>
      <YStack gap={6}>
        <Label>Link</Label>
        <Input
          size="$3"
          value={item.url}
          onChangeText={(url) => onChange({ url })}
          placeholder={`${ELIM_STORE_LISTING}/p/…`}
          autoCapitalize="none"
          autoCorrect={false}
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      </YStack>
    </YStack>
  )
}

function ShelfEditor({
  shelf,
  ourStory,
  onUpdate,
}: {
  shelf: StoreShelf
  ourStory: PageBlock[]
  /**
   * Change the shelf as it stands when the change lands, not as it was drawn.
   * A photo upload finishes seconds after it starts; written back from the
   * copy it began with, it undid whatever was moved or typed meanwhile.
   */
  onUpdate: (change: (shelf: StoreShelf) => StoreShelf) => void
}) {
  const colors = useThemeColors()
  const setItems = (change: (items: StoreItem[]) => StoreItem[]) =>
    onUpdate((s) => ({ ...s, items: change(s.items) }))

  return (
    <YStack gap={12}>
      <Text color={colors.text} fontSize={18} fontWeight="800">
        {shelf.title || 'Shelf'}
      </Text>
      <YStack gap={6}>
        <Label>Heading</Label>
        <Input
          size="$3"
          value={shelf.title}
          onChangeText={(title) => onUpdate((s) => ({ ...s, title }))}
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      </YStack>
      <YStack gap={6}>
        <Label>Description</Label>
        <TextArea
          size="$3"
          value={shelf.body}
          onChangeText={(body: string) => onUpdate((s) => ({ ...s, body }))}
          minHeight={70}
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      </YStack>
      {shelf.items.map((item, i) => (
        <ItemEditor
          key={item.id}
          item={item}
          index={i}
          count={shelf.items.length}
          onChange={(patch) =>
            setItems((items) => items.map((x) => (x.id === item.id ? { ...x, ...patch } : x)))
          }
          onMove={(by) =>
            setItems((items) =>
              moveItem(
                items,
                items.findIndex((x) => x.id === item.id),
                by
              )
            )
          }
          onRemove={() => setItems((items) => items.filter((x) => x.id !== item.id))}
        />
      ))}
      <XStack gap={8} flexWrap="wrap">
        <SmallButton
          label="+ Add item"
          onPress={() =>
            setItems((items) => [
              ...items,
              { id: newItemId(), title: '', image: '', url: ELIM_STORE_LISTING },
            ])
          }
        />
        {/* The books follow Our Story until edited; this puts them back. */}
        {shelf.id === 'books' ? (
          <SmallButton
            label="Use Our Story’s covers"
            onPress={() => setItems(() => booksFromOurStory(ourStory))}
          />
        ) : null}
      </XStack>
    </YStack>
  )
}

/**
 * Change what the Elim Store tab says and shows.
 *
 * The wording at the top, each shelf's heading and description, and the items
 * on it — photo, name and link — which can be added, removed and put in
 * order. Nothing is written until Save, and an upload that a saved store no
 * longer uses is deleted then rather than as it is replaced, so closing
 * without saving leaves the tab exactly as it was.
 */
export function StoreEditor({
  store,
  ourStory,
  onClose,
}: {
  store: StoreContent
  ourStory: PageBlock[]
  onClose: () => void
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const toast = useUIStore((s) => s.toast)
  const [draft, setDraft] = useState<StoreContent>(store)
  const [busy, setBusy] = useState(false)

  const updateShelf = (id: string, change: (shelf: StoreShelf) => StoreShelf) =>
    setDraft((d) => ({ ...d, shelves: d.shelves.map((s) => (s.id === id ? change(s) : s)) }))

  const save = async () => {
    // An item left with neither a name nor a photo is a slip, not an item.
    const cleaned: StoreContent = {
      ...draft,
      shelves: draft.shelves.map((s) => ({
        ...s,
        items: s.items
          .map((i) => ({ ...i, title: i.title.trim(), image: i.image.trim(), url: i.url.trim() }))
          .filter((i) => i.title || i.image),
      })),
    }
    setBusy(true)
    try {
      await saveStore(cleaned)
      const kept = new Set(storeUploads(cleaned))
      for (const url of storeUploads(store)) if (!kept.has(url)) void deletePageImage(url)
      toast('Store saved', 'success')
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the store', 'error')
    } finally {
      setBusy(false)
    }
  }

  const text = (key: 'tagline' | 'intro' | 'featuredNote', label: string, multiline = false) => (
    <YStack gap={6}>
      <Label>{label}</Label>
      {multiline ? (
        <TextArea
          size="$3"
          value={draft[key]}
          onChangeText={(v: string) => setDraft((d) => ({ ...d, [key]: v }))}
          minHeight={70}
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      ) : (
        <Input
          size="$3"
          value={draft[key]}
          onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
          color={colors.text}
          backgroundColor={colors.background}
          borderColor={colors.border}
        />
      )}
    </YStack>
  )

  return (
    <FullScreenOverlay visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <XStack
          paddingHorizontal="$4"
          paddingTop={insets.top + 16}
          paddingBottom="$3"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          alignItems="center"
          justifyContent="space-between"
          gap={10}
        >
          <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
            Edit the Elim Store
          </Text>
          <SmallButton label="Cancel" onPress={onClose} disabled={busy} />
          <SmallButton
            label={busy ? 'Saving…' : 'Save'}
            onPress={save}
            disabled={busy}
            tone="primary"
          />
        </XStack>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 28, maxWidth: 720 }}>
          <YStack gap={12}>
            <Text color={colors.text} fontSize={18} fontWeight="800">
              Wording
            </Text>
            {text('tagline', 'Tagline')}
            {text('intro', 'Introduction', true)}
            {text('featuredNote', 'Featured-items note', true)}
          </YStack>
          {draft.shelves.map((shelf) => (
            <ShelfEditor
              key={shelf.id}
              shelf={shelf}
              ourStory={ourStory}
              onUpdate={(change) => updateShelf(shelf.id, change)}
            />
          ))}
          <SmallButton
            label={busy ? 'Saving…' : 'Save'}
            onPress={save}
            disabled={busy}
            tone="primary"
          />
        </ScrollView>
      </View>
    </FullScreenOverlay>
  )
}
