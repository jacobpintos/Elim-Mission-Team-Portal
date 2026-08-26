import { YStack, Text, Input } from 'tamagui'
import { DEFAULT_EMBED_HEIGHT, clampEmbedHeight } from '../BlockRenderer/EmbedBlock'
import type { EmbedData } from '@/types/pages'

interface EmbedEditorProps {
  data: EmbedData
  onChange: (data: EmbedData) => void
}

export function EmbedEditor({ data, onChange }: EmbedEditorProps) {
  const update = (patch: Partial<EmbedData>) => onChange({ ...data, ...patch })

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Page address
        </Text>
        <Input
          placeholder="https://..."
          value={data.url ?? ''}
          onChangeText={(v) => update({ url: v })}
          size="$3"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Heading (optional)
        </Text>
        <Input
          placeholder="What this is"
          value={data.heading ?? ''}
          onChangeText={(v) => update({ heading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Height
        </Text>
        <Input
          placeholder={String(DEFAULT_EMBED_HEIGHT)}
          value={data.height ? String(data.height) : ''}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '')
            update({ height: digits ? clampEmbedHeight(Number(digits)) : undefined })
          }}
          size="$3"
          keyboardType="number-pad"
        />
        <Text fontSize="$1" color="$gray10">
          A web page has no height this app can measure, so it has to be set. The embed scrolls its
          own content inside this box.
        </Text>
      </YStack>

      <Text fontSize="$1" color="$gray10">
        Best for things with no version inside the app — a form, a giving page, a public calendar.
        Content you own is better built from the other blocks: those match the theme, work offline
        and do not scroll inside a second window. Some sites also refuse to be shown inside another
        page, in which case only the “Open in browser” link will work.
      </Text>
    </YStack>
  )
}
