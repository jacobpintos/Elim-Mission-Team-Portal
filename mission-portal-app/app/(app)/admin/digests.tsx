import { useEffect } from 'react'
import { Alert } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import { useDigestStore, type DigestStatDoc } from '@/stores/digestStore'
import { useUIStore } from '@/stores/uiStore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

function formatTimestamp(ts: unknown): string {
  if (!ts) return 'N/A'
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleString()
  }
  if (typeof ts === 'number') return new Date(ts).toLocaleString()
  return 'N/A'
}

function pct(num: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((num / total) * 100)}%`
}

function StatCard({
  type,
  stats,
}: {
  type: 'weekly' | 'monthly'
  stats: DigestStatDoc | undefined
}) {
  const label = type === 'weekly' ? 'Weekly Digest' : 'Monthly Digest'
  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      gap="$2"
    >
      <Text fontWeight="700" fontSize="$4">
        {label}
      </Text>
      {stats ? (
        <>
          <Text fontSize="$2" color="$gray10">
            Last sent: {formatTimestamp(stats.sentAt)}
          </Text>
          <Text fontSize="$2" color="$gray10">
            Recipients: {stats.recipients}
          </Text>
          <Text fontSize="$2" color="$gray10">
            Delivered: {pct(stats.delivered, stats.recipients)}
          </Text>
          <Text fontSize="$2" color="$gray10">
            Bounce: {pct(stats.bounced, stats.recipients)}
          </Text>
          <Text fontSize="$2" color="$gray10">
            Open: {pct(stats.opened, stats.recipients)}
          </Text>
        </>
      ) : (
        <Text fontSize="$2" color="$gray10">
          No sends yet
        </Text>
      )}
    </YStack>
  )
}

export default function AdminDigests() {
  const { stats, loading, fetchStats } = useDigestStore()
  const { toast } = useUIStore()

  useEffect(() => {
    fetchStats()
  }, [])

  const lastWeekly = stats.find((s) => s.type === 'weekly')
  const lastMonthly = stats.find((s) => s.type === 'monthly')

  const sendDigest = (type: 'weekly' | 'monthly') => {
    const label = type === 'weekly' ? 'Weekly' : 'Monthly'
    Alert.alert(
      `Send ${label} Digest`,
      `Send the ${label.toLowerCase()} digest to all subscribers now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const functions = getFunctions()
              const sendDigestManual = httpsCallable(functions, 'sendDigestManual')
              await sendDigestManual({ type })
              toast(`${label} digest queued!`, 'success')
              await fetchStats()
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to send digest'
              toast(message, 'error')
            }
          },
        },
      ]
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Email Digests', headerShown: false }} />

      <Text fontSize="$6" fontWeight="700">
        Email Digests
      </Text>

      {loading ? (
        <YStack alignItems="center" justifyContent="center" flex={1}>
          <Spinner size="large" />
        </YStack>
      ) : (
        <>
          {/* Stat cards */}
          <XStack gap="$3">
            <StatCard type="weekly" stats={lastWeekly} />
            <StatCard type="monthly" stats={lastMonthly} />
          </XStack>

          {/* Send buttons */}
          <XStack gap="$3">
            <Button
              flex={1}
              size="$3"
              onPress={() => sendDigest('weekly')}
              theme="active"
            >
              Send Weekly Now
            </Button>
            <Button
              flex={1}
              size="$3"
              onPress={() => sendDigest('monthly')}
              theme="active"
            >
              Send Monthly Now
            </Button>
          </XStack>

          {/* History */}
          <Text fontWeight="700" fontSize="$4">
            Send History
          </Text>

          <FlashList
            data={stats}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <XStack
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
                gap="$2"
                alignItems="center"
              >
                <XStack
                  backgroundColor={item.type === 'weekly' ? '$blue4' : '$purple4'}
                  borderRadius="$4"
                  paddingHorizontal="$2"
                  paddingVertical="$0.5"
                >
                  <Text fontSize="$1" color={item.type === 'weekly' ? '$blue10' : '$purple10'} fontWeight="600">
                    {item.type}
                  </Text>
                </XStack>
                <YStack flex={1}>
                  <Text fontSize="$2" fontWeight="600">
                    {formatTimestamp(item.sentAt)}
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    {item.recipients} recipients · {pct(item.delivered, item.recipients)} delivered · {pct(item.opened, item.recipients)} opened
                  </Text>
                </YStack>
              </XStack>
            )}
            ListEmptyComponent={
              <Text color="$gray10" textAlign="center" paddingVertical="$4">
                No digest history yet
              </Text>
            }
          />
        </>
      )}
    </YStack>
  )
}
