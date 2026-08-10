import { useCallback, useEffect, useState } from 'react'
import { Pressable, View, StyleSheet, ActivityIndicator } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import * as Clipboard from 'expo-clipboard'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'

export interface ConnectionSummary {
  pageId: string
  pageName: string
  pagePicture?: string | null
  status: string
  connectedAt?: number | null
  lastSyncedAt?: number | null
  lastSyncError?: string | null
  postCount: number
}

interface Props {
  /** Facebook Page this portal page currently mirrors. */
  value: string
  onChange: (fbPageId: string) => void
}

/** An unreachable callable is indistinguishable from "nothing connected yet". */
async function fetchConnections(): Promise<ConnectionSummary[]> {
  try {
    const call = httpsCallable<unknown, { connections: ConnectionSummary[] }>(
      functions,
      'listFbConnections'
    )
    const res = await call({})
    return res.data.connections
  } catch {
    return []
  }
}

function relative(ms?: number | null): string {
  if (!ms) return 'never'
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/**
 * Admin controls for the Facebook integration.
 *
 * Connecting a Page is deliberately not something an admin can do from here:
 * only the Page's own owner can grant access, on Facebook, while signed in as
 * themselves. What an admin does is generate the invitation link, send it, and
 * afterwards pick which connected Page this portal page should mirror.
 */
export function FacebookConnectPanel({ value, onChange }: Props) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)

  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setConnections(await fetchConnections())
  }, [])

  useEffect(() => {
    let alive = true
    fetchConnections().then((list) => {
      if (alive) setConnections(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const generateLink = async () => {
    setBusy('link')
    try {
      const call = httpsCallable<{ label: string }, { url: string }>(
        functions,
        'createFbConnectLink'
      )
      const res = await call({ label: '' })
      setInviteUrl(res.data.url)
      await Clipboard.setStringAsync(res.data.url)
      toast('Link created and copied', 'success')
    } catch {
      toast('Could not create a link', 'error')
    } finally {
      setBusy(null)
    }
  }

  const copyLink = async () => {
    if (!inviteUrl) return
    await Clipboard.setStringAsync(inviteUrl)
    toast('Link copied', 'success')
  }

  const syncNow = async (pageId: string) => {
    setBusy(pageId)
    try {
      const call = httpsCallable<{ pageId: string }, { synced: number }>(functions, 'syncFbPageNow')
      const res = await call({ pageId })
      toast(`Synced ${res.data.synced} post${res.data.synced === 1 ? '' : 's'}`, 'success')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (pageId: string) => {
    setBusy(pageId)
    try {
      const call = httpsCallable<{ pageId: string }, { removed: number }>(
        functions,
        'disconnectFbPage'
      )
      await call({ pageId })
      if (value === pageId) onChange('')
      toast('Page disconnected', 'info')
      await load()
    } catch {
      toast('Could not disconnect', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <YStack
      borderWidth={1}
      borderColor={colors.border}
      borderRadius="$3"
      padding="$3"
      gap="$3"
      backgroundColor={colors.background}
    >
      <XStack gap="$2" alignItems="center">
        <View style={styles.fbBadge}>
          <Text color="white" fontSize={11} fontWeight="700">
            f
          </Text>
        </View>
        <Text color={colors.text} fontWeight="700" fontSize="$3">
          Facebook Page
        </Text>
      </XStack>

      {connections === null ? (
        <XStack gap="$2" alignItems="center" paddingVertical="$2">
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text color={colors.textMuted} fontSize={12}>
            Checking connections…
          </Text>
        </XStack>
      ) : connections.length === 0 ? (
        <Text color={colors.textMuted} fontSize={12} lineHeight={18}>
          No Pages are connected yet. Create a link below and send it to the Page&apos;s owner —
          only they can grant access, from their own Facebook account.
        </Text>
      ) : (
        <YStack gap="$2">
          <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
            SHOW POSTS FROM
          </Text>
          {connections.map((c) => {
            const selected = c.pageId === value
            const failing = c.status === 'error'
            return (
              <Pressable key={c.pageId} onPress={() => onChange(selected ? '' : c.pageId)}>
                <YStack
                  borderWidth={selected ? 2 : 1}
                  borderColor={selected ? colors.primary : colors.border}
                  borderRadius="$2"
                  padding="$2"
                  gap="$1"
                  backgroundColor={colors.surface}
                >
                  <XStack gap="$2" alignItems="center">
                    <Text
                      color={colors.text}
                      fontWeight="700"
                      fontSize={14}
                      flex={1}
                      numberOfLines={1}
                    >
                      {c.pageName}
                    </Text>
                    {selected ? (
                      <Text color={colors.primary} fontSize={12} fontWeight="700">
                        ✓ Selected
                      </Text>
                    ) : null}
                  </XStack>

                  <Text color={colors.textMuted} fontSize={11}>
                    {c.postCount} post{c.postCount === 1 ? '' : 's'} · synced{' '}
                    {relative(c.lastSyncedAt)}
                  </Text>

                  {/* A dead token is silent otherwise: the feed simply stops
                      updating and nothing in the app looks wrong. */}
                  {failing ? (
                    <Text style={styles.errorText}>
                      ⚠ Sync failing — {c.lastSyncError ?? 'unknown error'}. The owner may need to
                      reconnect.
                    </Text>
                  ) : null}

                  <XStack gap="$3" marginTop={4}>
                    <Pressable onPress={() => syncNow(c.pageId)} disabled={busy === c.pageId}>
                      <Text color={colors.primary} fontSize={12} fontWeight="600">
                        {busy === c.pageId ? 'Working…' : 'Sync now'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => disconnect(c.pageId)} disabled={busy === c.pageId}>
                      <Text style={styles.dangerText}>Disconnect</Text>
                    </Pressable>
                  </XStack>
                </YStack>
              </Pressable>
            )
          })}
        </YStack>
      )}

      <YStack gap="$2" borderTopWidth={1} borderTopColor={colors.border} paddingTop="$3">
        <Text color={colors.textMuted} fontSize={12} lineHeight={18}>
          Send a connection link to a Page owner. It works once, expires in 14 days, and carries no
          password or token.
        </Text>

        <Pressable onPress={generateLink} disabled={busy === 'link'}>
          <XStack
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$2"
            paddingVertical="$2"
            justifyContent="center"
            opacity={busy === 'link' ? 0.5 : 1}
          >
            <Text color={colors.primary} fontWeight="700" fontSize="$3">
              {busy === 'link' ? 'Creating…' : '+ Create connection link'}
            </Text>
          </XStack>
        </Pressable>

        {inviteUrl ? (
          <YStack gap="$1" backgroundColor={colors.surface} borderRadius="$2" padding="$2">
            <Text color={colors.text} fontSize={11} selectable>
              {inviteUrl}
            </Text>
            <Pressable onPress={copyLink}>
              <Text color={colors.primary} fontSize={12} fontWeight="600">
                Copy again
              </Text>
            </Pressable>
          </YStack>
        ) : null}
      </YStack>
    </YStack>
  )
}

const styles = StyleSheet.create({
  fbBadge: {
    backgroundColor: '#1877F2',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  errorText: {
    color: '#c0392b',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  dangerText: {
    color: '#c0392b',
    fontSize: 12,
    fontWeight: '600',
  },
})
