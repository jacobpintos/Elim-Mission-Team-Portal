import { useRouter } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const SECTIONS = [
  { label: 'User Management', path: '/(app)/admin/users', icon: '👥' },
  { label: 'Groups', path: '/(app)/admin/groups', icon: '🗂' },
  { label: 'Common Teams', path: '/(app)/admin/teams', icon: '🤝' },
  { label: 'Task Templates', path: '/(app)/admin/templates', icon: '📋' },
  { label: 'Leadership Team', path: '/(app)/admin/leadership', icon: '⭐' },
  { label: 'Audit Trail', path: '/(app)/admin/audit', icon: '🔍' },
  { label: 'Theme', path: '/(app)/admin/theme', icon: '🎨' },
  { label: 'Digests', path: '/(app)/admin/digests', icon: '📰' },
]

export default function RolehubAdmin() {
  const colors = useThemeColors()
  const router = useRouter()

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Admin' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {SECTIONS.map((s) => (
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
              <Text color={colors.textMuted} fontSize="$4">›</Text>
            </XStack>
          </Pressable>
        ))}
      </ScrollView>
    </YStack>
  )
}
