import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function Planning() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Planning' }} />
      <H2>Planning</H2>
      <Paragraph>Mission planning tools coming soon.</Paragraph>
    </YStack>
  )
}
