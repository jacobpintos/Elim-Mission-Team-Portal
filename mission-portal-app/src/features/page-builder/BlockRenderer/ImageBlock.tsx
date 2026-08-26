import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { YStack, Text } from 'tamagui'
import type { ImageData } from '@/types/pages'

interface ImageBlockProps {
  data: ImageData
}

const MAX_WIDTH = 600

/**
 * Something has to hold the space before the file reports its own proportions,
 * and a landscape guess is wrong less badly than a square one.
 */
const FALLBACK_RATIO = 3 / 2

export function ImageBlock({ data }: ImageBlockProps) {
  // A fixed height cropped every picture that was not exactly that shape —
  // portraits lost their heads. The file knows its own proportions, so the
  // block waits to be told them and then takes whatever height that implies.
  const [ratio, setRatio] = useState<number | null>(null)
  const align = data.align ?? 'center'
  const flexAlign = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

  if (!data.src) {
    return (
      <YStack padding="$4" alignItems={flexAlign}>
        <View
          style={{
            width: 200,
            height: 120,
            backgroundColor: '#e0e0e0',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text color="$gray9" fontSize="$3">
            No image
          </Text>
        </View>
      </YStack>
    )
  }

  return (
    <YStack padding="$4" alignItems={flexAlign} gap="$2">
      <Image
        source={{ uri: data.src }}
        style={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          aspectRatio: ratio ?? FALLBACK_RATIO,
          borderRadius: 8,
        }}
        contentFit="cover"
        onLoad={(e) => {
          const { width, height } = e.source
          if (width > 0 && height > 0) setRatio(width / height)
        }}
      />
      {data.caption ? (
        <Text fontSize="$2" color="$gray10" textAlign={align}>
          {data.caption}
        </Text>
      ) : null}
    </YStack>
  )
}
