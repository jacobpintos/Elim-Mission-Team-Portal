import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function Kaizen() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Kaizen' }} />
      <H2>Kaizen Board</H2>
      <Paragraph>Continuous improvement items coming soon.</Paragraph>
    </YStack>
  )
}
