import { ScrollView, Pressable } from 'react-native'
import { Slot, useRouter, usePathname } from 'expo-router'
import { XStack, Text, YStack, View } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const BASE_TABS = [
  { key: 'users', label: 'User Management', path: '/(app)/admin/users' },
  { key: 'avail', label: 'Availability', path: '/(app)/admin/avail' },
  { key: 'groups', label: 'Groups', path: '/(app)/admin/groups' },
  { key: 'teams', label: 'Common Teams', path: '/(app)/admin/teams' },
  { key: 'templates', label: 'Task Templates', path: '/(app)/admin/templates' },
  { key: 'leadership', label: 'Leadership Team', path: '/(app)/admin/leadership' },
  { key: 'analytics', label: 'Public Analytics', path: '/(app)/admin/analytics' },
  { key: 'audit', label: 'Audit Trail', path: '/(app)/admin/audit' },
  { key: 'theme', label: 'Theme', path: '/(app)/admin/theme' },
  { key: 'digests', label: 'Digests', path: '/(app)/admin/digests' },
  { key: 'archive', label: 'Events Archive', path: '/(app)/admin/archive' },
]

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
                    borderBottomColor={isActive ? '#e8624a' : 'transparent'}
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
