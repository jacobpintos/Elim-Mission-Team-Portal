import { Pressable } from 'react-native'
import { YStack, XStack, Text, TextArea, Input } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { QuoteData } from '@/types/pages'

interface QuoteEditorProps {
  data: QuoteData
  onChange: (data: QuoteData) => void
}

const SIZES: { key: 'large' | 'display' | 'huge'; label: string }[] = [
  { key: 'large', label: 'Large' },
  { key: 'display', label: 'Display' },
  { key: 'huge', label: 'Huge' },
]

const ALIGNS: { key: 'left' | 'center'; label: string }[] = [
  { key: 'left', label: 'Left' },
  { key: 'center', label: 'Centred' },
]

const TONES: { key: 'accent' | 'plain'; label: string }[] = [
  { key: 'accent', label: 'Whole line' },
  { key: 'plain', label: 'Marked words only' },
]

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const colors = useThemeColors()
  return (
    <Pressable onPress={onPress}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderRadius="$2"
        borderWidth={1}
        backgroundColor={selected ? colors.primary : 'transparent'}
        borderColor={selected ? colors.primary : colors.border}
      >
        <Text color={selected ? 'white' : colors.text} fontSize="$2" fontWeight="600">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )
}

export function QuoteEditor({ data, onChange }: QuoteEditorProps) {
  const colors = useThemeColors()
  const update = (patch: Partial<QuoteData>) => onChange({ ...data, ...patch })
  const size = data.size ?? 'large'
  const align = data.align ?? 'left'
  const tone = data.tone ?? 'accent'
  const boxed = data.boxed ?? false

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
        {/* Spelled out here rather than left to be discovered. The marks are
            the only way to emphasise a word in this box, so an editor who does
            not know they exist cannot use them. */}
        <Text color={colors.textMuted} fontSize="$1" lineHeight={16}>
          Put weight on a word with *heavier*, _underlined_ or ^capitals^. They combine — *^like
          this^*. A backslash before one prints it instead: \*. Press return to break the line where
          you want it.
        </Text>
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Size
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {SIZES.map((s) => (
            <Choice
              key={s.key}
              label={s.label}
              selected={size === s.key}
              onPress={() => update({ size: s.key })}
            />
          ))}
        </XStack>
        <Text color={colors.textMuted} fontSize="$1" lineHeight={16}>
          The bigger steps fit fewer words to a line on a phone. Break the line yourself with return
          rather than leaving it to wrap where it lands.
        </Text>
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Alignment
        </Text>
        <XStack gap="$2">
          {ALIGNS.map((a) => (
            <Choice
              key={a.key}
              label={a.label}
              selected={align === a.key}
              onPress={() => update({ align: a.key })}
            />
          ))}
        </XStack>
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Colour
        </Text>
        <XStack gap="$2">
          {TONES.map((t) => (
            <Choice
              key={t.key}
              label={t.label}
              selected={tone === t.key}
              onPress={() => update({ tone: t.key })}
            />
          ))}
        </XStack>
        <Text color={colors.textMuted} fontSize="$1" lineHeight={16}>
          A long line set entirely in the theme colour has nowhere for the eye to land. Choose
          &ldquo;marked words only&rdquo; and pick the word out with ~ instead.
        </Text>
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Panel
        </Text>
        <XStack gap="$2">
          <Choice label="None" selected={!boxed} onPress={() => update({ boxed: false })} />
          <Choice label="Boxed" selected={boxed} onPress={() => update({ boxed: true })} />
        </XStack>
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
