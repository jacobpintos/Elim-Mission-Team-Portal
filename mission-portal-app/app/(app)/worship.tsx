import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function Worship() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Worship' }} />
      <H2>Worship</H2>
      <Paragraph color="$colorMuted">Setlist and input list tools coming soon.</Paragraph>
    </YStack>
  )
}
