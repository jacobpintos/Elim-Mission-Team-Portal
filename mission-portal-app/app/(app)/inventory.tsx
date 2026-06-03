import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useInventoryStore } from '@/stores/inventoryStore'
import { useAuthStore } from '@/stores/authStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { ProductionTab } from '@/features/inventory/ProductionTab'
import { ReorderTab } from '@/features/inventory/ReorderTab'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function InventoryScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const { subscribe, unsubscribe } = useInventoryStore()
  const [activeTab, setActiveTab] = useState<'production' | 'reorder'>('production')

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Inventory' }} />

      <XStack paddingHorizontal="$3" paddingTop="$3" paddingBottom="$2" gap="$2">
        {(['production', 'reorder'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)}>
            <XStack
              backgroundColor={activeTab === tab ? colors.primary : colors.surface}
              borderRadius={99}
              borderWidth={1}
              borderColor={activeTab === tab ? colors.primary : colors.border}
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              <Text
                color={activeTab === tab ? 'white' : colors.textMuted}
                fontWeight={activeTab === tab ? '700' : '400'}
                fontSize="$3"
              >
                {tab === 'production' ? 'Production' : 'Reorder'}
              </Text>
            </XStack>
          </Pressable>
        ))}
      </XStack>

      {activeTab === 'production' ? (
        <ProductionTab isAdmin={admin} />
      ) : (
        <ReorderTab isAdmin={admin} />
      )}
    </YStack>
  )
}
