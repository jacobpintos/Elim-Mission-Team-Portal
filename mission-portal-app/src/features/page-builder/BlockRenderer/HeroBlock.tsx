import { View, ImageBackground, useWindowDimensions } from 'react-native'
import { YStack, Text } from 'tamagui'
import type { HeroData } from '@/types/pages'

interface HeroBlockProps {
  data: HeroData
}

export function HeroBlock({ data }: HeroBlockProps) {
  const { width } = useWindowDimensions()
  const textColor = data.textColor ?? '#ffffff'
  const overlayColor = data.overlayColor ?? 'rgba(0,0,0,0.4)'

  const content = (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        minHeight: 200,
        backgroundColor: overlayColor,
      }}
    >
      {data.heading ? (
        <Text
          fontSize="$8"
          fontWeight="800"
          textAlign="center"
          style={{ color: textColor, marginBottom: 12 }}
        >
          {data.heading}
        </Text>
      ) : null}
      {data.subheading ? (
        <Text
          fontSize="$5"
          textAlign="center"
          style={{ color: textColor, opacity: 0.9 }}
        >
          {data.subheading}
        </Text>
      ) : null}
    </View>
  )

  if (data.bgImage) {
    return (
      <ImageBackground
        source={{ uri: data.bgImage }}
        style={{ width: '100%', minHeight: 220 }}
        resizeMode="cover"
      >
        {content}
      </ImageBackground>
    )
  }

  return (
    <YStack
      width="100%"
      minHeight={220}
      backgroundColor="$gray8"
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      {data.heading ? (
        <Text fontSize="$8" fontWeight="800" textAlign="center" style={{ color: textColor }}>
          {data.heading}
        </Text>
      ) : null}
      {data.subheading ? (
        <Text
          fontSize="$5"
          textAlign="center"
          marginTop="$2"
          style={{ color: textColor, opacity: 0.9 }}
        >
          {data.subheading}
        </Text>
      ) : null}
    </YStack>
  )
}
