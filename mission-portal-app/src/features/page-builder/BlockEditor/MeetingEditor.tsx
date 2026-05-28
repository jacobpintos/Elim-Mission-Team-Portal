import { YStack, Text, Input, TextArea } from 'tamagui'
import type { MeetingData } from '@/types/pages'

interface MeetingEditorProps {
  data: MeetingData
  onChange: (data: MeetingData) => void
}

export function MeetingEditor({ data, onChange }: MeetingEditorProps) {
  const update = (patch: Partial<MeetingData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Section Heading
        </Text>
        <Input
          placeholder="Meet Our Leaders"
          value={data.heading ?? ''}
          onChangeText={(v) => update({ heading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Intro Text
        </Text>
        <TextArea
          placeholder="Intro paragraph about meeting with leadership..."
          value={data.intro ?? ''}
          onChangeText={(v) => update({ intro: v })}
          numberOfLines={4}
          size="$3"
        />
      </YStack>
    </YStack>
  )
}
