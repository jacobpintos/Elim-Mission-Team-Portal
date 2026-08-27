import { useState } from 'react'
import { YStack, XStack, Text, Input, TextArea, Button } from 'tamagui'
import { Pressable } from 'react-native'
import { Image } from 'expo-image'
import { MIN_COLUMNS, MAX_COLUMNS, clampColumns, remapLinks, setLinkAt } from '@/lib/galleryGrid'
import { useUIStore } from '@/stores/uiStore'
import { pickAndUploadPageImages } from '@/lib/pageImageUpload'
import type { GalleryData } from '@/types/pages'

interface GalleryEditorProps {
  data: GalleryData
  pageKey: string
  onChange: (data: GalleryData) => void
}

export function GalleryEditor({ data, pageKey, onChange }: GalleryEditorProps) {
  const { toast } = useUIStore()
  const [progress, setProgress] = useState<string | null>(null)
  const update = (patch: Partial<GalleryData>) => onChange({ ...data, ...patch })
  const columns = clampColumns(data.columns)
  const images = data.images ?? []
  const links = data.links ?? []

  /**
   * The whole point of this screen: several photos in one go.
   *
   * Uploads append rather than replace, so a gallery can be filled over more
   * than one sitting, and the links already set stay with the pictures they
   * were set on.
   */
  const addPhotos = async () => {
    setProgress('Uploading…')
    try {
      const picked = await pickAndUploadPageImages(pageKey, {
        multiple: true,
        onProgress: (done, total) => setProgress(`Uploading ${done} of ${total}…`),
      })
      if (picked.length > 0) update({ images: [...images, ...picked.map((p) => p.url)] })
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not add those photos', 'error')
    } finally {
      setProgress(null)
    }
  }

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Heading (optional)
        </Text>
        <Input
          placeholder="What these are"
          value={data.heading ?? ''}
          onChangeText={(v) => update({ heading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$2">
        <Text fontSize="$3" fontWeight="600">
          Photos
        </Text>
        <Button size="$3" theme="active" onPress={addPhotos} disabled={progress !== null}>
          {progress ?? 'Add photos'}
        </Button>
        <Text fontSize="$1" color="$gray10">
          Choose as many as you like at once — they are added to the end of the grid.
        </Text>
        <TextArea
          placeholder={'https://...\nhttps://...'}
          value={images.join('\n')}
          onChangeText={(v) => {
            const next = v
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
            update({ images: next, links: remapLinks(images, links, next) })
          }}
          size="$3"
          numberOfLines={5}
          autoCapitalize="none"
        />
        <Text fontSize="$1" color="$gray10">
          One address per line, in the order they appear. Uploaded photos add themselves here; edit
          this only to reorder them, remove one, or paste an address from elsewhere.
        </Text>
      </YStack>

      {images.length > 0 ? (
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600">
            Links (optional)
          </Text>
          {images.map((src, i) => (
            <XStack key={`${src}-${i}`} gap="$2" alignItems="center">
              <Image
                source={{ uri: src }}
                style={{ width: 44, height: 44, borderRadius: 4 }}
                contentFit="contain"
              />
              <Input
                flex={1}
                placeholder="https://... (optional)"
                value={links[i] ?? ''}
                onChangeText={(v) => update({ links: setLinkAt(links, i, v) })}
                size="$3"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </XStack>
          ))}
          <Text fontSize="$1" color="$gray10">
            A picture with a link opens that page when tapped. Leave it blank and the picture opens
            full screen instead.
          </Text>
        </YStack>
      ) : null}

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Columns
        </Text>
        <XStack gap="$2">
          {Array.from({ length: MAX_COLUMNS - MIN_COLUMNS + 1 }, (_, i) => i + MIN_COLUMNS).map(
            (n) => {
              const isActive = columns === n
              return (
                <Pressable key={n} onPress={() => update({ columns: n })}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={isActive ? '$primary' : '$borderColor'}
                    backgroundColor={isActive ? '$primary' : 'transparent'}
                  >
                    <Text fontSize="$3" color={isActive ? 'white' : '$color'}>
                      {n}
                    </Text>
                  </XStack>
                </Pressable>
              )
            }
          )}
        </XStack>
      </YStack>
    </YStack>
  )
}
