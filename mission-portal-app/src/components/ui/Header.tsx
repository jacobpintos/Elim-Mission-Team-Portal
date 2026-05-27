import { XStack, Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface HeaderProps {
  title: string
  right?: React.ReactNode
  left?: React.ReactNode
}

export function Header({ title, right, left }: HeaderProps) {
  const insets = useSafeAreaInsets()

  return (
    <XStack
      backgroundColor="$background"
      borderBottomColor="$borderColor"
      borderBottomWidth={1}
      paddingTop={insets.top}
      paddingHorizontal="$4"
      paddingBottom="$3"
      alignItems="center"
      justifyContent="space-between"
    >
      <XStack flex={1}>{left}</XStack>
      <Text fontWeight="700" fontSize="$5" flex={2} textAlign="center">
        {title}
      </Text>
      <XStack flex={1} justifyContent="flex-end">
        {right}
      </XStack>
    </XStack>
  )
}
