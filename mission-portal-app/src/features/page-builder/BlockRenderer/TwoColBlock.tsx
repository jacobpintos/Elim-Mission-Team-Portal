import { Image, useWindowDimensions } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import type { TwoColData } from '@/types/pages'

interface TwoColBlockProps {
  data: TwoColData
}

export function TwoColBlock({ data }: TwoColBlockProps) {
  const { width } = useWindowDimensions()
  const isWide = width >= 640

  const leftContent = (
    <YStack flex={1} gap="$2" padding="$3">
      {data.leftHead ? (
        <Text fontSize="$5" fontWeight="700">
          {data.leftHead}
        </Text>
      ) : null}
      {(data.leftContent ?? '').split('\n').filter((p) => p.trim()).map((p, i) => (
        <Text key={i} fontSize="$4" lineHeight={22} color="$color">
          {p}
        </Text>
      ))}
    </YStack>
  )

  const rightContent = (
    <YStack flex={1} gap="$2" padding="$3">
      {data.rightImage ? (
        <Image
          source={{ uri: data.rightImage }}
          style={{ width: '100%', height: 200, borderRadius: 8 }}
          resizeMode="cover"
        />
      ) : null}
      {(data.rightContent ?? '').split('\n').filter((p) => p.trim()).map((p, i) => (
        <Text key={i} fontSize="$4" lineHeight={22} color="$color">
          {p}
        </Text>
      ))}
    </YStack>
  )

  if (isWide) {
    return (
      <XStack>
        {leftContent}
        {rightContent}
      </XStack>
    )
  }

  return (
    <YStack>
      {leftContent}
      {rightContent}
    </YStack>
  )
}
