import { Slot, useRouter, usePathname } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

// Worship deliberately absent: it has its own top-level tab, and the entry
// here was a bare re-export of that same screen, so admins — who see both —
// were given the identical screen under two different names.
const TABS = [
  { key: 'inventory', label: 'Inventory', path: '/(app)/rolehub/inventory' },
  { key: 'admin', label: 'Admin', path: '/(app)/rolehub/admin' },
]

export default function RolehubLayout() {
  const colors = useThemeColors()
  const pathname = usePathname()
  const router = useRouter()
  const activeKey = pathname.split('/').pop() ?? 'inventory'

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        <XStack>
          {TABS.map((tab) => {
            const isActive = activeKey === tab.key || (activeKey === 'rolehub' && tab.key === 'inventory')
            return (
              <Pressable key={tab.key} onPress={() => router.push(tab.path as never)}>
                <XStack
                  paddingHorizontal={14}
                  paddingVertical={12}
                  borderBottomWidth={isActive ? 2 : 0}
                  borderBottomColor={isActive ? colors.primary : 'transparent'}
                >
                  <Text
                    fontSize="$3"
                    fontWeight={isActive ? '700' : '400'}
                    color={isActive ? colors.text : colors.textMuted}
                  >
                    {tab.label}
                  </Text>
                </XStack>
              </Pressable>
            )
          })}
        </XStack>
      </ScrollView>
      <YStack flex={1}>
        <Slot />
      </YStack>
    </YStack>
  )
}
