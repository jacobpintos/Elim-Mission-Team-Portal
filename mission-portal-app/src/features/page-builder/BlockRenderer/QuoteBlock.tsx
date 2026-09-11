import { YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { parseEmphasis } from '@/lib/textEmphasis'
import type { QuoteData } from '@/types/pages'

interface QuoteBlockProps {
  data: QuoteData
}

/**
 * A line set apart from the body around it.
 *
 * Its job on a page is to be the break between one section and the next — a
 * heading would be read as starting something, and this is closer to
 * punctuation.
 *
 * Two ways to colour it. On 'accent' the whole line carries the theme colour,
 * which is how this block has always read. On 'plain' the line is ordinary
 * text and only the words marked `~` are picked out, which is the stronger
 * setting for a long line: colour everywhere is colour nowhere.
 */
export function QuoteBlock({ data }: QuoteBlockProps) {
  const colors = useThemeColors()
  if (!data.text) return null

  const display = data.size === 'display'
  const centered = data.align === 'center'
  const plain = data.tone === 'plain'
  const segments = parseEmphasis(data.text)

  const line = (
    <Text
      fontSize={display ? '$9' : '$8'}
      // Roomier than the default for its size. A tagline broken over two or
      // three lines needs air between them or it sets as a slab.
      lineHeight={display ? 42 : 34}
      fontWeight="600"
      textAlign={centered ? 'center' : 'left'}
      color={plain ? colors.text : colors.primary}
    >
      {segments.map((seg, i) => (
        <Text
          key={i}
          // Colour is set on every run, never inherited. A Tamagui Text carries
          // its own default from the theme, so a nested one does not take the
          // colour of the line it sits in — it resets to the body colour, which
          // is how wrapping these runs turned an accent-coloured quote white.
          color={seg.accent || !plain ? colors.primary : colors.text}
          fontWeight={seg.bold ? '900' : undefined}
          textDecorationLine={seg.underline ? 'underline' : undefined}
          textTransform={seg.caps ? 'uppercase' : undefined}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  )

  const attribution = data.attribution ? (
    <Text color={colors.textMuted} fontSize="$3" textAlign={centered ? 'center' : 'left'}>
      — {data.attribution}
    </Text>
  ) : null

  if (data.boxed) {
    return (
      <YStack padding="$4">
        <YStack
          padding="$4"
          gap="$2"
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.primary}
          // A wash of the accent rather than the surface colour, so the panel
          // belongs to the line inside it and does not read as another card.
          backgroundColor={colors.primary + '14'}
        >
          {line}
          {attribution}
        </YStack>
      </YStack>
    )
  }

  return (
    <YStack padding="$4" gap="$2">
      {line}
      {attribution}
    </YStack>
  )
}
