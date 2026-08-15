import { Slot, useRouter, usePathname } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'

const ALL_TABS = [
  { key: 'index', label: 'Issues', path: '/(app)/issues' },
  { key: 'kaizen', label: 'Kaizen', path: '/(app)/issues/kaizen' },
  { key: 'planning', label: 'Planning', path: '/(app)/issues/planning', adminOnly: true },
  // Moved here from Role-Specific. It stays admin-only: this hides the tab,
  // and the screen itself redirects anyone else who reaches the route.
  { key: 'inventory', label: 'Inventory', path: '/(app)/issues/inventory', adminOnly: true },
]

export default function IssuesLayout() {
  const { profile } = useAuthStore()
  const colors = useThemeColors()
  const pathname = usePathname()
  const router = useRouter()
  const admin = isAdmin(profile)

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || admin)
  const activeKey =
    pathname === '/(app)/issues' || pathname.endsWith('/issues')
      ? 'index'
      : (pathname.split('/').pop() ?? 'index')

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        <XStack>
          {tabs.map((tab) => {
            const isActive = activeKey === tab.key
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
