import { Slot } from 'expo-router'
import { YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

/**
 * No sub-tab bar: Admin is all that lives here.
 *
 * Worship left because it had its own top-level tab and this was a bare
 * re-export of the same screen. Inventory moved to Operations. A bar holding
 * a single "Admin" tab, under a drawer entry also called Admin, is a row of
 * chrome that says nothing.
 */
export default function RolehubLayout() {
  const colors = useThemeColors()

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Slot />
    </YStack>
  )
}
