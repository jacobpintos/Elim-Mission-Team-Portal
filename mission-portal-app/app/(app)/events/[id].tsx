import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function EventDetail() {
  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Event Detail' }} />
      <H2>Event Detail</H2>
      <Paragraph>Coming in phase 2.</Paragraph>
    </YStack>
  )
}
