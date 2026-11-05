import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Text, XStack, YStack } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import { formatPhone } from '@/lib/textingList'
import { markAdded, unmarkAdded, watchRequests, type TextingRequest } from '@/lib/textingListDb'

/**
 * Tasks: the people who asked to join the texting list and haven't been
 * added yet, for the Connections Coordinator — each the moment they ask,
 * not only in the 5 PM notification. Added in the service that sends the
 * texts, and marked added here, they come off the list.
 *
 * Shown to the Coordinator; with nobody holding it, to admins, so the
 * requests aren't waiting unseen.
 */
export function TextingRequestsSection() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const profile = useAuthStore((s) => s.profile)
  const coordinator = useConfigStore((s) => s.connectionsCoordinator)
  const uid = String(profile?.uid ?? '')
  const theirs = !!uid && coordinator === uid
  const shown = theirs || (!coordinator && isAdmin(profile))

  const [requests, setRequests] = useState<TextingRequest[]>([])
  const [collapsed, setCollapsed] = useState(false)
  // Just marked added: there to take back, for a while.
  const [marked, setMarked] = useState<TextingRequest | null>(null)

  useEffect(() => {
    useConfigStore.getState().subscribe()
    return () => useConfigStore.getState().unsubscribe()
  }, [])

  useEffect(() => {
    if (!shown) return
    return watchRequests(setRequests, () => setRequests([]))
  }, [shown])

  if (!shown || (requests.length === 0 && !marked)) return null

  const added = async (r: TextingRequest) => {
    try {
      await markAdded(r.uid, uid)
      setMarked(r)
    } catch {
      toast('That didn’t save — try again in a moment.', 'error')
    }
  }
  const undo = async () => {
    if (!marked) return
    try {
      await unmarkAdded(marked.uid, marked.status)
      setMarked(null)
    } catch {
      toast('That didn’t save — try again in a moment.', 'error')
    }
  }
  const copy = async (r: TextingRequest) => {
    await Clipboard.setStringAsync(formatPhone(r.phone))
    toast(`Copied ${formatPhone(r.phone)}`, 'success')
  }
  const link = (text: string, onPress: () => void, label: string) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}>
      <Text color={colors.primary} fontSize="$3" fontWeight="700">
        {text}
      </Text>
    </Pressable>
  )

  return (
    <YStack gap="$2">
      <Pressable onPress={() => setCollapsed((c) => !c)} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="center" paddingVertical="$1">
          <Text color={colors.text} fontWeight="700" fontSize="$3">
            Texting list
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {requests.length} to add {collapsed ? '▸' : '▾'}
          </Text>
        </XStack>
      </Pressable>

      {collapsed ? null : (
        <>
          <Text color={colors.textMuted} fontSize="$2">
            {theirs
              ? 'Add each in the service that sends the texts, then mark them added.'
              : 'Nobody is Connections Coordinator, so these are shown to admins. Choose one in Admin → Leadership Team.'}
          </Text>
          {requests.map((r) => (
            <XStack
              key={r.uid}
              alignItems="center"
              gap="$3"
              padding="$3"
              borderRadius={12}
              borderWidth={1}
              borderColor={colors.border}
              backgroundColor={colors.surface}
            >
              <YStack flex={1} gap="$1">
                <Text color={colors.text} fontSize="$4" fontWeight="700">
                  {r.displayName.trim() || 'Someone'}
                </Text>
                <Pressable
                  onPress={() => copy(r)}
                  accessibilityRole="button"
                  accessibilityHint="Copies the number"
                >
                  <Text color={colors.text} fontSize="$3">
                    {formatPhone(r.phone)}
                    <Text color={colors.textMuted} fontSize="$2">
                      {r.at ? `  ·  asked ${FD(new Date(r.at).toISOString().slice(0, 10))}` : ''}
                    </Text>
                  </Text>
                </Pressable>
              </YStack>
              {link('Copy', () => copy(r), `Copy ${r.displayName}’s number`)}
              <Pressable
                onPress={() => added(r)}
                accessibilityRole="button"
                accessibilityLabel={`${r.displayName} is added to the texting list`}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 14,
                  borderRadius: 18,
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text color={colors.onPrimary} fontSize="$3" fontWeight="700">
                  Added ✓
                </Text>
              </Pressable>
            </XStack>
          ))}
          {marked ? (
            <XStack gap="$2" alignItems="center" flexWrap="wrap">
              <Text color={colors.textMuted} fontSize="$2">
                {marked.displayName.trim() || 'Someone'} marked added.
              </Text>
              {link('Undo', undo, `Take back marking ${marked.displayName} added`)}
              {link('OK', () => setMarked(null), 'Dismiss')}
            </XStack>
          ) : null}
        </>
      )}
    </YStack>
  )
}
