import { YStack, Text, Input, TextArea } from 'tamagui'
import type { TextData } from '@/types/pages'

interface TextEditorProps {
  data: TextData
  onChange: (data: TextData) => void
}

export function TextEditor({ data, onChange }: TextEditorProps) {
  const update = (patch: Partial<TextData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Heading (optional)
        </Text>
        <Input
          placeholder="Section heading"
          value={data.heading ?? ''}
          onChangeText={(v) => update({ heading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Content
        </Text>
        <TextArea
          placeholder="Paragraph text. Use newlines for separate paragraphs."
          value={data.content ?? ''}
          onChangeText={(v) => update({ content: v })}
          numberOfLines={6}
          size="$3"
        />
      </YStack>
    </YStack>
  )
}
