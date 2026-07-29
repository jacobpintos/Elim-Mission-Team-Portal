import { useEffect, useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { audit } from '@/lib/audit'
import { sameId } from '@/lib/ids'
import { MODERATION_SLA_HOURS } from '@/lib/orgInfo'
import type { ContentReport } from '@/lib/moderation'

/** Fields written when an admin closes out a report. */
function resolution(status: 'actioned' | 'dismissed', adminUid: string) {
  return { status, resolvedBy: adminUid, resolvedAt: Date.now() }
}

export default function AdminModeration() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users, subscribe, unsubscribe } = useUsersStore()
  const toast = useUIStore((s) => s.toast)
  const [reports, setReports] = useState<ContentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    subscribe()
    const q = query(collection(db, 'contentReports'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ ...(d.data() as ContentReport), id: d.id })))
      setLoading(false)
    })
    return () => {
      unsub()
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameFor = (uid: string) => {
    const u = users.find((x) => sameId(x.uid, uid))
    return u?.displayName ?? u?.email ?? uid
  }

  const resolve = async (report: ContentReport, status: 'actioned' | 'dismissed') => {
    setBusy(report.id)
    try {
      await updateDoc(doc(db, 'contentReports', report.id), resolution(status, profile?.uid ?? ''))
      await audit(
        `moderation.${status}`,
        `Report on message by ${nameFor(report.authorUid)} marked ${status}`,
        profile?.displayName ?? ''
      )
    } catch {
      toast('Failed to update report', 'error')
    } finally {
      setBusy(null)
    }
  }

  const removeMessage = async (report: ContentReport) => {
    const ok = await confirmAsync(
      'Delete this message for everyone in the room? This cannot be undone.',
      { title: 'Remove message', confirmLabel: 'Delete', destructive: true }
    )
    if (!ok) return
    setBusy(report.id)
    try {
      await deleteDoc(doc(db, 'rooms', report.roomId, 'messages', report.messageId))
      await updateDoc(
        doc(db, 'contentReports', report.id),
        resolution('actioned', profile?.uid ?? '')
      )
      await audit(
        'moderation.messageRemoved',
        `Removed reported message by ${nameFor(report.authorUid)}`,
        profile?.displayName ?? ''
      )
      toast('Message removed', 'success')
    } catch {
      toast('Failed to remove message', 'error')
    } finally {
      setBusy(null)
    }
  }

  const open = reports.filter((r) => r.status === 'open')
  const resolved = reports.filter((r) => r.status !== 'open')
  const shown = showResolved ? resolved : open

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text color={colors.textMuted} fontSize="$2" lineHeight={18}>
        Reports filed by users about messages in the app. The Terms of Use commit to acting on every
        report within {MODERATION_SLA_HOURS} hours — remove the message, or dismiss the report if
        the content is fine. To remove an abusive user entirely, delete their account in User
        Management.
      </Text>

      <XStack gap="$2">
        <Pressable onPress={() => setShowResolved(false)}>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor={!showResolved ? colors.primary : 'transparent'}
            borderWidth={1}
            borderColor={colors.border}
          >
            <Text color={!showResolved ? 'white' : colors.text} fontSize="$3" fontWeight="600">
              Open ({open.length})
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={() => setShowResolved(true)}>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor={showResolved ? colors.primary : 'transparent'}
            borderWidth={1}
            borderColor={colors.border}
          >
            <Text color={showResolved ? 'white' : colors.text} fontSize="$3" fontWeight="600">
              Resolved ({resolved.length})
            </Text>
          </XStack>
        </Pressable>
      </XStack>

      {shown.length === 0 ? (
        <YStack paddingVertical="$6" alignItems="center">
          <Text color={colors.textMuted}>
            {showResolved ? 'Nothing resolved yet.' : 'No open reports. 🎉'}
          </Text>
        </YStack>
      ) : (
        shown.map((r) => (
          <YStack
            key={r.id}
            gap="$2"
            padding="$3"
            borderRadius="$3"
            backgroundColor={colors.surface}
            borderWidth={1}
            borderColor={r.status === 'open' ? '#e74c3c' : colors.border}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color="#e74c3c" fontSize="$2" fontWeight="700">
                {r.reason}
              </Text>
              <Text color={colors.textMuted} fontSize="$1">
                {new Date(r.createdAt).toLocaleString()}
              </Text>
            </XStack>

            <Text color={colors.textMuted} fontSize="$2">
              {nameFor(r.reporterUid)} reported {nameFor(r.authorUid)}
            </Text>

            <YStack
              padding="$2"
              borderRadius="$2"
              backgroundColor={colors.background}
              borderLeftWidth={3}
              borderLeftColor={colors.border}
            >
              <Text color={colors.text} fontSize="$3">
                {r.messageText || '(no text — attachment only)'}
              </Text>
            </YStack>

            {r.details ? (
              <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
                “{r.details}”
              </Text>
            ) : null}

            {r.status === 'open' ? (
              <XStack gap="$2" marginTop="$1">
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => removeMessage(r)}
                  disabled={busy === r.id}
                >
                  <XStack
                    height={38}
                    borderRadius={8}
                    backgroundColor="#c0392b"
                    alignItems="center"
                    justifyContent="center"
                    opacity={busy === r.id ? 0.5 : 1}
                  >
                    <Text color="white" fontSize="$3" fontWeight="700">
                      Remove message
                    </Text>
                  </XStack>
                </Pressable>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => resolve(r, 'dismissed')}
                  disabled={busy === r.id}
                >
                  <XStack
                    height={38}
                    borderRadius={8}
                    borderWidth={1}
                    borderColor={colors.border}
                    alignItems="center"
                    justifyContent="center"
                    opacity={busy === r.id ? 0.5 : 1}
                  >
                    <Text color={colors.text} fontSize="$3" fontWeight="700">
                      Dismiss
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
            ) : (
              <Text color={colors.textMuted} fontSize="$2">
                {r.status === 'actioned' ? 'Actioned' : 'Dismissed'}
                {r.resolvedBy ? ` by ${nameFor(r.resolvedBy)}` : ''}
                {r.resolvedAt ? ` · ${new Date(r.resolvedAt).toLocaleString()}` : ''}
              </Text>
            )}
          </YStack>
        ))
      )}
    </ScrollView>
  )
}
