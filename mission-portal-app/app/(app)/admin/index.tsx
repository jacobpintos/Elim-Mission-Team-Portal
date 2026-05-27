import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function AdminIndex() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Admin' }} />
      <H2>Admin</H2>
      <Paragraph>Coming in phase 2.</Paragraph>
    </YStack>
  )
}
