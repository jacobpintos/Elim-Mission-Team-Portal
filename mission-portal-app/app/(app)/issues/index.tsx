import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function IssuesIndex() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Issues' }} />
      <H2>Issues</H2>
      <Paragraph>Coming in phase 2.</Paragraph>
    </YStack>
  )
}
