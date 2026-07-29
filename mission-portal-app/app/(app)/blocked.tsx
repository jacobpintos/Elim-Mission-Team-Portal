import { useEffect, useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { Avatar } from '@/components/ui/Avatar'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { unblockUser } from '@/lib/moderation'
import { confirmAsync } from '@/lib/confirm'
import { sameId } from '@/lib/ids'

export default function BlockedUsersScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const { users, subscribe, unsubscribe } = useUsersStore()
  const toast = useUIStore((s) => s.toast)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const blocked = profile?.blockedUsers ?? []

  const handleUnblock = async (blockedUid: string, name: string) => {
    const ok = await confirmAsync(`Unblock ${name}? You will see their messages again.`, {
      title: 'Unblock user',
      confirmLabel: 'Unblock',
    })
    if (!ok || !profile) return
    setBusy(blockedUid)
    try {
      await unblockUser(profile.uid, blockedUid)
      toast(`${name} unblocked`, 'success')
    } catch {
      toast('Failed to unblock', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Blocked users' }} />

      {/* ScreenTitle is a no-op on web, so this screen needs its own way back. */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Button size="$3" variant="outlined" onPress={() => router.back()}>
          ← Back
        </Button>
        <Text color={colors.text} fontSize={18} fontWeight="700" flex={1}>
          Blocked users
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text color={colors.textMuted} fontSize="$3" lineHeight={20}>
          You do not see messages from anyone on this list, in any conversation — including group
          chats created later. To block someone, tap “🚩 Report” under any message they sent and
          choose Block.
        </Text>

        {blocked.length === 0 ? (
          <YStack paddingVertical="$6" alignItems="center">
            <Text color={colors.textMuted}>You have not blocked anyone.</Text>
          </YStack>
        ) : (
          blocked.map((blockedUid) => {
            const u = users.find((x) => sameId(x.uid, blockedUid))
            const name = u?.displayName ?? u?.email ?? blockedUid
            return (
              <XStack
                key={blockedUid}
                alignItems="center"
                gap="$3"
                padding="$3"
                borderRadius="$3"
                backgroundColor={colors.surface}
              >
                <Avatar uri={u?.photoURL} displayName={name} size={40} />
                <Text color={colors.text} fontSize="$4" flex={1} numberOfLines={1}>
                  {name}
                </Text>
                <Pressable
                  onPress={() => handleUnblock(blockedUid, name)}
                  disabled={busy === blockedUid}
                >
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                    opacity={busy === blockedUid ? 0.5 : 1}
                  >
                    <Text color={colors.text} fontSize="$3" fontWeight="600">
                      {busy === blockedUid ? 'Working…' : 'Unblock'}
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
            )
          })
        )}
      </ScrollView>
    </YStack>
  )
}
