import { YStack, Text } from 'tamagui'
import type { TextData } from '@/types/pages'

interface TextBlockProps {
  data: TextData
}

export function TextBlock({ data }: TextBlockProps) {
  const paragraphs = (data.content ?? '').split('\n').filter((p) => p.trim())

  return (
    <YStack padding="$4" gap="$3">
      {data.heading ? (
        <Text fontSize="$6" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}
      {paragraphs.map((p, i) => (
        <Text key={i} fontSize="$4" lineHeight={24} color="$color">
          {p}
        </Text>
      ))}
    </YStack>
  )
}
