import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function Security() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Security' }} />
      <H2>Security</H2>
      <Paragraph color="$colorMuted">Security reports and queue coming soon.</Paragraph>
    </YStack>
  )
}
