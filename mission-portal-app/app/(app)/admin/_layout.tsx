import { ScrollView, Pressable } from 'react-native'
import { Slot, useRouter, usePathname } from 'expo-router'
import { XStack, Text, YStack, View } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { adminSectionsFor } from '@/lib/adminSections'
import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'

export default function AdminLayout() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [pendingDel, setPendingDel] = useState<unknown[]>([])
  // Who the Accountant is, or null until config has been read.
  const [accountant, setAccountant] = useState<string | null>(null)

  const admin = isAdmin(profile)
  const isAccountant = !!profile?.uid && accountant === profile.uid
  const onFinance = pathname.endsWith('/finance')
  // Admins have the whole area. The Accountant who is not an admin has
  // Finance and nothing else in it.
  const allowed = admin || (isAccountant && onFinance)

  useEffect(() => {
    // Waits for config before deciding about anyone who is not an admin, so
    // the Accountant is not sent away while it loads.
    if (!admin && accountant === null) return
    if (!allowed) router.replace(isAccountant ? '/(app)/admin/finance' : '/(app)/dashboard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, accountant, allowed])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      setPendingDel(data?.pendingDel ?? [])
      setAccountant(String(data?.connectConfig?.accountant ?? ''))
    })
    return () => unsub()
  }, [])

  const tabs = [
    ...adminSectionsFor({ admin, accountant: isAccountant }).map((s) => ({
      key: s.key,
      label: s.tabLabel ?? s.label,
      path: s.path,
    })),
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

  if (!allowed) return null
  // Finance alone needs no tab bar.
  if (!admin) {
    return (
      <YStack flex={1}>
        <Slot />
      </YStack>
    )
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
