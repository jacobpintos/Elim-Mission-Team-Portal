import { Platform } from 'react-native'
import { YStack, Text } from 'tamagui'

interface ColorPickerProps {
  value: string
  onChange?: (color: string) => void
  label?: string
}

/**
 * Phase 1 stub. Phase 5 implements the full color wheel + RGB picker.
 * On web: react-colorful. On native: custom implementation.
 */
export function ColorPicker({ value, label }: ColorPickerProps) {
  if (Platform.OS === 'web') {
    // Phase 5 will render react-colorful here
    return (
      <YStack gap="$2">
        {label && <Text fontWeight="600">{label}</Text>}
        <YStack
          width={120}
          height={40}
          borderRadius="$2"
          backgroundColor={value as `#${string}`}
          borderColor="$borderColor"
          borderWidth={1}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$2" color="$colorMuted">
            {value}
          </Text>
        </YStack>
        <Text color="$colorMuted" fontSize="$2">
          Full color picker coming in phase 5
        </Text>
      </YStack>
    )
  }

  // Native stub
  return (
    <YStack gap="$2">
      {label && <Text fontWeight="600">{label}</Text>}
      <YStack
        width={120}
        height={40}
        borderRadius="$2"
        backgroundColor={value as `#${string}`}
        borderColor="$borderColor"
        borderWidth={1}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$2">{value}</Text>
      </YStack>
    </YStack>
  )
}
