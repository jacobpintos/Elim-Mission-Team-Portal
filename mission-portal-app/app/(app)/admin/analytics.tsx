import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import type { UserProfile } from '@/types/user'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <YStack
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      padding="$4"
      gap="$1"
      flex={1}
    >
      <Text fontSize="$7" fontWeight="700">{value}</Text>
      <Text fontSize="$3" fontWeight="600">{label}</Text>
      {sub ? <Text fontSize="$2" color="$gray10">{sub}</Text> : null}
    </YStack>
  )
}

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true)
  const [totalPublic, setTotalPublic] = useState(0)
  const [activeRecent, setActiveRecent] = useState(0)

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const publicUsers = snap.docs.filter((d) => {
          const roles: string[] = d.data().roles ?? []
          return roles.length === 1 && roles[0] === 'public'
        })
        setTotalPublic(publicUsers.length)
        const cutoff = Date.now() - SEVEN_DAYS
        const recent = publicUsers.filter((d) => {
          const lastLogin: number = d.data().lastLoginAt ?? 0
          return lastLogin > cutoff
        })
        setActiveRecent(recent.length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <ScreenTitle options={{ title: 'Public Analytics', headerShown: false }} />

      <Text fontSize="$6" fontWeight="700">Public Analytics</Text>

      {loading ? (
        <YStack alignItems="center" paddingVertical="$8">
          <Spinner size="large" />
        </YStack>
      ) : (
        <>
          <XStack gap="$3">
            <StatCard label="Total Public Users" value={totalPublic} />
            <StatCard label="Active (7 days)" value={activeRecent} sub="by last login" />
          </XStack>

          <YStack
            backgroundColor="$background"
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$3"
            padding="$4"
            gap="$2"
          >
            <Text fontSize="$4" fontWeight="700">App Downloads</Text>
            <Text fontSize="$3" color="$gray10">
              Download tracking will be available once mobile apps are published to the App Store
              and Google Play.
            </Text>
          </YStack>
        </>
      )}
    </YStack>
  )
}
