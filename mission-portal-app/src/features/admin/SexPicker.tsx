import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { CARD_COLORS } from '@/features/events/carpoolCards'
import type { Sex } from '@/types/user'

const OPTIONS: { value: Sex | null; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: null, label: 'Not set' },
]

/**
 * Male or female, set by an admin (UserProfile.sex).
 *
 * It does one thing: colours this person's card when a carpool is arranged —
 * blue for male, pink for female — so the chosen option is drawn in the
 * colour its card will be.
 */
export function SexPicker({
  value,
  onChange,
}: {
  value: Sex | null
  onChange: (value: Sex | null) => void
}) {
  const colors = useThemeColors()
  return (
    <YStack gap="$1">
      <XStack gap="$2" flexWrap="wrap">
        {OPTIONS.map((o) => {
          const on = value === o.value
          const tint = o.value ? CARD_COLORS[o.value] : null
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$3"
                borderWidth={on ? 2 : 1}
                borderColor={on ? (tint?.border ?? colors.primary) : colors.border}
                backgroundColor={on ? (tint?.background ?? colors.surface) : colors.surface}
              >
                <Text
                  fontSize="$3"
                  fontWeight={on ? '700' : '400'}
                  color={on ? (tint?.text ?? colors.text) : colors.textMuted}
                >
                  {o.label}
                </Text>
              </XStack>
            </Pressable>
          )
        })}
      </XStack>
      <Text fontSize="$2" color={colors.textMuted}>
        Only used to color their card when arranging carpools.
      </Text>
    </YStack>
  )
}
