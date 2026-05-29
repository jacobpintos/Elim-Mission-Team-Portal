import { ScrollView } from 'react-native'
import { YStack, H2, Paragraph } from 'tamagui'
import { Stack } from 'expo-router'

export default function PublicStory() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Stack.Screen options={{ title: 'Our Story' }} />
      <YStack flex={1} padding="$4" gap="$3">
        <H2>Our Story</H2>
        <Paragraph color="$colorMuted">
          The church&apos;s story, mission, and values will appear here.
        </Paragraph>
      </YStack>
    </ScrollView>
  )
}
