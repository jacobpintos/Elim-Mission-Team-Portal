import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function Inventory() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Inventory' }} />
      <H2>Inventory</H2>
      <Paragraph color="$colorMuted">Merch inventory, reorder, and production coming soon.</Paragraph>
    </YStack>
  )
}
