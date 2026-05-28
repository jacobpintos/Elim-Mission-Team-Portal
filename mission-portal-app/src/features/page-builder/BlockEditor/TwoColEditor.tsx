import { YStack, Text, Input, TextArea } from 'tamagui'
import type { TwoColData } from '@/types/pages'

interface TwoColEditorProps {
  data: TwoColData
  onChange: (data: TwoColData) => void
}

export function TwoColEditor({ data, onChange }: TwoColEditorProps) {
  const update = (patch: Partial<TwoColData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <Text fontWeight="700" fontSize="$3" color="$gray10">
        Left Column
      </Text>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Left Heading
        </Text>
        <Input
          placeholder="Left column heading"
          value={data.leftHead ?? ''}
          onChangeText={(v) => update({ leftHead: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Left Content
        </Text>
        <TextArea
          placeholder="Left column text..."
          value={data.leftContent ?? ''}
          onChangeText={(v) => update({ leftContent: v })}
          numberOfLines={4}
          size="$3"
        />
      </YStack>

      <Text fontWeight="700" fontSize="$3" color="$gray10">
        Right Column
      </Text>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Right Image URL (optional)
        </Text>
        <Input
          placeholder="https://..."
          value={data.rightImage ?? ''}
          onChangeText={(v) => update({ rightImage: v })}
          size="$3"
          autoCapitalize="none"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Right Content
        </Text>
        <TextArea
          placeholder="Right column text..."
          value={data.rightContent ?? ''}
          onChangeText={(v) => update({ rightContent: v })}
          numberOfLines={4}
          size="$3"
        />
      </YStack>
    </YStack>
  )
}
