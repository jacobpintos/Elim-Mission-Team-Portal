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
 * Larger and in the theme's accent colour, because its job on a page is to be
 * the break between one section and the next — a heading would be read as
 * starting something, and this is closer to punctuation.
 *
 * Individual words can be lifted out of the line with the marks parseEmphasis
 * reads, so a tagline can put its weight where it belongs instead of setting
 * every word at the same pitch.
 */
export function QuoteBlock({ data }: QuoteBlockProps) {
  const colors = useThemeColors()
  if (!data.text) return null

  const display = data.size === 'display'
  const centered = data.align === 'center'
  const segments = parseEmphasis(data.text)

  return (
    <YStack padding="$4" gap="$2">
      <Text
        color={colors.primary}
        fontSize={display ? '$9' : '$8'}
        // Roomier than the default for its size. A tagline broken over two or
        // three lines needs air between them or the accent colour turns into a
        // block of colour rather than a sentence.
        lineHeight={display ? 42 : 34}
        fontWeight="600"
        textAlign={centered ? 'center' : 'left'}
      >
        {segments.map((seg, i) => (
          <Text
            key={i}
            // Inherited from the line above unless a mark overrides it, so an
            // unmarked run keeps the colour, size and leading of its
            // neighbours rather than resetting to the defaults.
            fontWeight={seg.bold ? '900' : undefined}
            textDecorationLine={seg.underline ? 'underline' : undefined}
            textTransform={seg.caps ? 'uppercase' : undefined}
          >
            {seg.text}
          </Text>
        ))}
      </Text>
      {data.attribution ? (
        <Text color={colors.textMuted} fontSize="$3" textAlign={centered ? 'center' : 'left'}>
          — {data.attribution}
        </Text>
      ) : null}
    </YStack>
  )
}
