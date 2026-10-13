import { Pressable } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { CarpoolCarData } from '@/types/events'
import type { UserProfile } from '@/types/user'
import type { CarpoolPerson } from './CarpoolBuilder'
import { carName, childNames } from './carpoolCards'

/** A user as a card in the carpool builder. */
export const carpoolPerson = (u: Pick<UserProfile, 'uid' | 'displayName' | 'email' | 'sex'>) => ({
  uid: String(u.uid),
  name: u.displayName || u.email || 'Someone',
  ...(u.sex ? { sex: u.sex } : {}),
})

/**
 * The cars as they stand, for an admin, with the button that opens the
 * builder (CarpoolBuilder) to change them.
 */
export function CarpoolSummary({
  cars,
  nameOf,
  unplaced = [],
  onArrange,
}: {
  cars: CarpoolCarData[]
  nameOf: (uid: string) => string
  /** Who is on the event and not in a car yet. */
  unplaced?: CarpoolPerson[]
  onArrange: () => void
}) {
  const colors = useThemeColors()
  return (
    <YStack gap="$2">
      {cars.map((car, i) => {
        const children = childNames(car)
        return (
          <YStack
            key={car.id}
            backgroundColor={colors.surface}
            borderRadius="$2"
            padding="$3"
            borderWidth={1}
            borderColor={colors.border}
            gap="$1"
          >
            <Text color={colors.text} fontWeight="700" fontSize="$3">
              🚗 {carName(car, i)}
            </Text>
            <Text color={colors.text} fontSize="$3">
              {car.driver ? `Driver: ${nameOf(car.driver)}` : 'No driver yet'}
            </Text>
            {car.riders.length || children.length ? (
              <Text color={colors.textMuted} fontSize="$2">
                Passengers: {[...car.riders.map(nameOf), ...children].join(', ')}
              </Text>
            ) : null}
          </YStack>
        )
      })}
      {unplaced.length > 0 && cars.length > 0 ? (
        <YStack
          backgroundColor="$yellow2"
          borderRadius="$2"
          padding="$3"
          borderWidth={1}
          borderColor="$yellow7"
          gap="$1"
        >
          <Text color="$yellow11" fontWeight="600" fontSize="$2">
            ⚠ {unplaced.length} not in a car
          </Text>
          <Text color="$yellow11" fontSize="$2">
            {unplaced.map((p) => p.name).join(', ')}
          </Text>
        </YStack>
      ) : null}
      <Pressable onPress={onArrange} accessibilityRole="button">
        <XStack
          borderWidth={1}
          borderColor={colors.primary}
          borderRadius="$2"
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignSelf="flex-start"
        >
          <Text color={colors.primary} fontSize="$3" fontWeight="600">
            {cars.length ? 'Arrange cars' : '+ Add cars'}
          </Text>
        </XStack>
      </Pressable>
    </YStack>
  )
}
