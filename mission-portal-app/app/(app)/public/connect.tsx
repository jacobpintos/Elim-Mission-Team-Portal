import { ScrollView } from 'react-native'
import { YStack, H2, Paragraph } from 'tamagui'
import { Stack } from 'expo-router'

export default function PublicConnect() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Stack.Screen options={{ title: 'Worship' }} />
      <YStack flex={1} padding="$4" gap="$3">
        <H2>Worship</H2>
        <Paragraph color="$colorMuted">
          Public worship content — setlists, media, and links — will appear here.
        </Paragraph>
      </YStack>
    </ScrollView>
  )
}
