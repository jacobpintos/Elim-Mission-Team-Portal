import { YStack, XStack, Text, Input, TextArea } from 'tamagui'
import { Pressable } from 'react-native'
import { MIN_COLUMNS, MAX_COLUMNS, clampColumns } from '@/lib/galleryGrid'
import type { GalleryData } from '@/types/pages'

interface GalleryEditorProps {
  data: GalleryData
  onChange: (data: GalleryData) => void
}

export function GalleryEditor({ data, onChange }: GalleryEditorProps) {
  const update = (patch: Partial<GalleryData>) => onChange({ ...data, ...patch })
  const columns = clampColumns(data.columns)

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

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Image addresses
        </Text>
        <TextArea
          placeholder={'https://...\nhttps://...'}
          value={(data.images ?? []).join('\n')}
          onChangeText={(v) =>
            update({
              images: v
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
          size="$3"
          numberOfLines={5}
          autoCapitalize="none"
        />
        <Text fontSize="$1" color="$gray10">
          One per line. They fill the grid in this order.
        </Text>
      </YStack>

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
