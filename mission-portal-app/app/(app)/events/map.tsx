import { YStack, Text } from 'tamagui'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { useThemeColors } from '@/theme/useThemeColors'

export default function EventsMapScreen() {
  const colors = useThemeColors()
  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      alignItems="center"
      justifyContent="center"
      gap="$3"
    >
      <ScreenTitle options={{ title: 'Events Map' }} />
      <Text fontSize={32}>🗺️</Text>
      <Text color={colors.text} fontWeight="700" fontSize="$4">
        Events Map
      </Text>
      <Text color={colors.textMuted} fontSize="$3" textAlign="center" paddingHorizontal="$6">
        Open the web app to view the interactive events map.
      </Text>
    </YStack>
  )
}
