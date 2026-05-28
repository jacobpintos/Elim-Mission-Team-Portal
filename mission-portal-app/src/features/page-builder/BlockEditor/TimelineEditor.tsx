import { YStack, XStack, Text, Input, Button } from 'tamagui'
import type { TimelineData } from '@/types/pages'

interface TimelineEditorProps {
  data: TimelineData
  onChange: (data: TimelineData) => void
}

export function TimelineEditor({ data, onChange }: TimelineEditorProps) {
  const entries = data.entries ?? []

  const updateEntry = (
    index: number,
    patch: Partial<{ year: string; title: string; desc: string }>
  ) => {
    const updated = [...entries]
    updated[index] = { ...updated[index], ...patch }
    onChange({ ...data, entries: updated })
  }

  const addEntry = () => {
    onChange({ ...data, entries: [...entries, { year: '', title: '', desc: '' }] })
  }

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index)
    onChange({ ...data, entries: updated })
  }

  return (
    <YStack gap="$3">
      <Text fontWeight="700" fontSize="$3">
        Timeline Entries
      </Text>

      {entries.map((entry, index) => (
        <YStack
          key={index}
          gap="$2"
          padding="$2"
          backgroundColor="$gray2"
          borderRadius="$2"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$2" fontWeight="600" color="$gray10">
              Entry {index + 1}
            </Text>
            <Button size="$1" onPress={() => removeEntry(index)} theme="red">
              Remove
            </Button>
          </XStack>

          <Input
            placeholder="Year (e.g. 2018)"
            value={entry.year}
            onChangeText={(v) => updateEntry(index, { year: v })}
            size="$3"
          />
          <Input
            placeholder="Title"
            value={entry.title}
            onChangeText={(v) => updateEntry(index, { title: v })}
            size="$3"
          />
          <Input
            placeholder="Description"
            value={entry.desc}
            onChangeText={(v) => updateEntry(index, { desc: v })}
            size="$3"
          />
        </YStack>
      ))}

      <Button size="$3" onPress={addEntry} theme="active" alignSelf="flex-start">
        + Add Entry
      </Button>
    </YStack>
  )
}
