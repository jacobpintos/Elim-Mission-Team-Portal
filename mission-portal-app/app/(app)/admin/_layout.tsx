import { ScrollView, Pressable } from 'react-native'
import { Slot, useRouter, usePathname } from 'expo-router'
import { XStack, Text, YStack, View } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { ADMIN_SECTIONS } from '@/lib/adminSections'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const BASE_TABS = ADMIN_SECTIONS.map((s) => ({
  key: s.key,
  label: s.tabLabel ?? s.label,
  path: s.path,
}))

export default function AdminLayout() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [pendingDel, setPendingDel] = useState<unknown[]>([])

  useEffect(() => {
    if (!isAdmin(profile)) {
      router.replace('/(app)/dashboard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      setPendingDel(data?.pendingDel ?? [])
    })
    return () => unsub()
  }, [])

  const tabs = [
    ...BASE_TABS,
    ...(pendingDel.length > 0
      ? [
          {
            key: 'deletions',
            label: `Deletions (${pendingDel.length})`,
            path: '/(app)/admin/users',
          },
        ]
      : []),
  ]

  const activeKey = pathname.split('/').pop() ?? 'users'

  if (!isAdmin(profile)) {
    return null
  }

  return (
    <YStack flex={1}>
      <View backgroundColor="$background" borderBottomWidth={1} borderBottomColor="$borderColor">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8 }}
        >
          <XStack gap="$0">
            {tabs.map((tab) => {
              const isActive = activeKey === tab.key || pathname.endsWith('/' + tab.key)
              const isDeletions = tab.key === 'deletions'
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => router.push(tab.path as never)}
                  style={{ position: 'relative' }}
                >
                  <View
                    paddingHorizontal={14}
                    paddingVertical={12}
                    borderBottomWidth={isActive ? 2 : 0}
                    borderBottomColor={isActive ? '#f56c5a' : 'transparent'}
                  >
                    <Text
                      fontSize="$3"
                      fontWeight={isActive ? '700' : '400'}
                      color={isActive ? '$color' : '$gray10'}
                      style={isDeletions ? { color: '#e74c3c' } : undefined}
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
