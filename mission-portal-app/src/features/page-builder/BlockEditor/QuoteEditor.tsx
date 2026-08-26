import { YStack, Text, TextArea, Input } from 'tamagui'
import type { QuoteData } from '@/types/pages'

interface QuoteEditorProps {
  data: QuoteData
  onChange: (data: QuoteData) => void
}

export function QuoteEditor({ data, onChange }: QuoteEditorProps) {
  const update = (patch: Partial<QuoteData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Quote
        </Text>
        <TextArea
          placeholder="The line to set apart"
          value={data.text ?? ''}
          onChangeText={(v) => update({ text: v })}
          size="$3"
          numberOfLines={3}
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Attribution (optional)
        </Text>
        <Input
          placeholder="Who said it"
          value={data.attribution ?? ''}
          onChangeText={(v) => update({ attribution: v })}
          size="$3"
        />
      </YStack>
    </YStack>
  )
}
