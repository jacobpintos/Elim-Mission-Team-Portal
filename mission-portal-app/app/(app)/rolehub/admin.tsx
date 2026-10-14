import { useRouter, Stack } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { adminSectionsFor } from '@/lib/adminSections'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { isAdmin } from '@/lib/roles'
import { useEffect } from 'react'

export default function RolehubAdmin() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const accountant = useConfigStore((s) => s.accountant)
  const { subscribe, unsubscribe } = useConfigStore()
  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])
  const sections = adminSectionsFor({
    admin: isAdmin(profile),
    accountant: !!profile?.uid && accountant === profile.uid,
  })

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Admin' }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {sections.map((s) => (
          <Pressable key={s.path} onPress={() => router.push(s.path as never)}>
            <XStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              borderWidth={1}
              borderColor={colors.border}
              padding="$4"
              gap="$3"
              alignItems="center"
            >
              <Text fontSize="$5">{s.icon}</Text>
              <Text color={colors.text} fontSize="$4" fontWeight="600" flex={1}>
                {s.label}
              </Text>
              <Text color={colors.textMuted} fontSize="$4">
                ›
              </Text>
            </XStack>
          </Pressable>
        ))}
      </ScrollView>
    </YStack>
  )
}
