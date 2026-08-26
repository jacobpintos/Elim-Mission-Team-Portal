import { YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
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
 */
export function QuoteBlock({ data }: QuoteBlockProps) {
  const colors = useThemeColors()
  if (!data.text) return null

  return (
    <YStack padding="$4" gap="$2">
      <Text color={colors.primary} fontSize="$8" fontWeight="600" lineHeight={36}>
        {data.text}
      </Text>
      {data.attribution ? (
        <Text color={colors.textMuted} fontSize="$3">
          — {data.attribution}
        </Text>
      ) : null}
    </YStack>
  )
}
