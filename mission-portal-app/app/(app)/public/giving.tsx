import { ScrollView } from 'react-native'
import { YStack, H2, Paragraph } from 'tamagui'
import { Stack } from 'expo-router'

export default function PublicGiving() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Stack.Screen options={{ title: 'Giving' }} />
      <YStack flex={1} padding="$4" gap="$3">
        <H2>Giving</H2>
        <Paragraph color="$colorMuted">
          Giving information and links will appear here.
        </Paragraph>
      </YStack>
    </ScrollView>
  )
}
