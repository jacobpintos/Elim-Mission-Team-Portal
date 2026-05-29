import { Slot, useRouter, usePathname } from 'expo-router'
import { ScrollView, Pressable } from 'react-native'
import { XStack, Text, YStack, View } from 'tamagui'

const TABS = [
  { key: 'posts',   label: 'Posts',     path: '/(app)/public/posts' },
  { key: 'connect', label: 'Worship',   path: '/(app)/public/connect' },
  { key: 'giving',  label: 'Giving',    path: '/(app)/public/giving' },
  { key: 'story',   label: 'Our Story', path: '/(app)/public/story' },
]

export default function PublicLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const activeKey = pathname.split('/').pop() ?? 'posts'

  return (
    <YStack flex={1}>
      <View
        backgroundColor="$background"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
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
                <Pressable
                  key={tab.key}
                  onPress={() => router.push(tab.path as never)}
                >
                  <View
                    paddingHorizontal={14}
                    paddingVertical={12}
                    borderBottomWidth={isActive ? 2 : 0}
                    borderBottomColor={isActive ? '#e8624a' : 'transparent'}
                  >
                    <Text
                      fontSize="$3"
                      fontWeight={isActive ? '700' : '400'}
                      color={isActive ? '$color' : '$gray10'}
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
