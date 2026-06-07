import { Slot, useRouter, usePathname } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { XStack, Text, YStack, View } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

const TABS = [
  { key: 'posts', label: 'Posts', path: '/(app)/public/posts' },
  { key: 'connect', label: 'Connect', path: '/(app)/public/connect' },
  { key: 'giving', label: 'Giving', path: '/(app)/public/giving' },
  { key: 'story', label: 'Our Story', path: '/(app)/public/story' },
  { key: 'music', label: 'Content', path: '/(app)/public/music' },
  { key: 'photos', label: 'Photos', path: '/(app)/public/photos' },
]

export default function PublicLayout() {
  const colors = useThemeColors()
  const router = useRouter()
  const pathname = usePathname()
  const activeKey = pathname.split('/').pop() ?? 'posts'

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <View
        backgroundColor={colors.background}
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8 }}
        >
          <XStack gap="$0">
            {TABS.map((tab) => {
              const isActive = activeKey === tab.key || pathname.endsWith('/' + tab.key)
              return (
                <Pressable key={tab.key} onPress={() => router.push(tab.path as never)}>
                  <View
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
                  </View>
                </Pressable>
              )
            })}
          </XStack>
        </ScrollView>
      </View>
      <YStack flex={1}>
        <Slot />
      </YStack>
    </YStack>
  )
}
