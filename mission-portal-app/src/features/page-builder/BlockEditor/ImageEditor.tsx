import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import type { ImageData } from '@/types/pages'

interface ImageEditorProps {
  data: ImageData
  onChange: (data: ImageData) => void
}

const ALIGNMENTS: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

export function ImageEditor({ data, onChange }: ImageEditorProps) {
  const update = (patch: Partial<ImageData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Image URL
        </Text>
        <Input
          placeholder="https://..."
          value={data.src ?? ''}
          onChangeText={(v) => update({ src: v })}
          size="$3"
          autoCapitalize="none"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Caption (optional)
        </Text>
        <Input
          placeholder="Image caption"
          value={data.caption ?? ''}
          onChangeText={(v) => update({ caption: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Alignment
        </Text>
        <XStack gap="$2">
          {ALIGNMENTS.map((a) => {
            const isActive = (data.align ?? 'center') === a.value
            return (
              <Pressable key={a.value} onPress={() => update({ align: a.value })}>
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor={isActive ? '$primary' : '$borderColor'}
                  backgroundColor={isActive ? '$primary' : 'transparent'}
                >
                  <Text
                    fontSize="$3"
                    color={isActive ? 'white' : '$color'}
                    fontWeight={isActive ? '700' : '400'}
                  >
                    {a.label}
                  </Text>
                </XStack>
              </Pressable>
            )
          })}
        </XStack>
      </YStack>
    </YStack>
  )
}
