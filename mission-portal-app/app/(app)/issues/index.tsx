import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function IssuesIndex() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Operations' }} />
      <H2>Operations</H2>
      <Paragraph color="$colorMuted">Production issues, Kaizen board, and planning coming soon.</Paragraph>
    </YStack>
  )
}
