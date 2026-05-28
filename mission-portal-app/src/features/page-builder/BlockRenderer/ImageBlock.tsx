import { Image, View } from 'react-native'
import { YStack, Text } from 'tamagui'
import type { ImageData } from '@/types/pages'

interface ImageBlockProps {
  data: ImageData
}

export function ImageBlock({ data }: ImageBlockProps) {
  const align = data.align ?? 'center'
  const flexAlign =
    align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

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
        style={{ width: '100%', maxWidth: 600, height: 300, borderRadius: 8 }}
        resizeMode="cover"
      />
      {data.caption ? (
        <Text fontSize="$2" color="$gray10" textAlign={align}>
          {data.caption}
        </Text>
      ) : null}
    </YStack>
  )
}
