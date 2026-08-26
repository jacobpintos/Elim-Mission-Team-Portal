import { useEffect, useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Spinner, Image } from 'tamagui'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useMessagesStore } from '@/stores/messagesStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { audit } from '@/lib/audit'
import { sameId } from '@/lib/ids'
import { MODERATION_SLA_HOURS } from '@/lib/orgInfo'
import type { ContentReport } from '@/lib/moderation'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { InboxTabs, INBOX_TITLE } from '@/features/inbox/InboxTabs'

/** Fields written when an admin closes out a report. */
function resolution(status: 'actioned' | 'dismissed', adminUid: string) {
  return { status, resolvedBy: adminUid, resolvedAt: Date.now() }
}

/**
 * Tell the reporter their report was dealt with, without saying how.
 *
 * Deliberately identical for every outcome. What happened to another user —
 * whether they were warned, had a message removed, or nothing was done — is
 * that user's business, and revealing it invites retaliation between people who
 * are on the same team. The reporter only needs to know it was not ignored.
 */
async function notifyReporterResolved(report: ContentReport) {
  if (!report.reporterUid) return
  try {
    const sendNotif = httpsCallable(functions, 'sendNotification')
    await sendNotif({
      uid: String(report.reporterUid),
      type: 'announcement',
      data: {
        title: 'Your report has been reviewed',
        body: 'Thank you for reporting. We reviewed the message and have taken any action we judged necessary. We do not share what was decided about another member.',
      },
    })
  } catch {
    // A failed courtesy notification must not roll back the moderation action
    // that already succeeded.
  }
}

export default function AdminModeration() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { rooms, subscribe: subRooms, unsubscribe: unsubRooms } = useMessagesStore()
  const toast = useUIStore((s) => s.toast)
  const [reports, setReports] = useState<ContentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  useEffect(() => {
    subscribe()
    subRooms(profile?.uid ?? '', true)
    const q = query(collection(db, 'contentReports'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ ...(d.data() as ContentReport), id: d.id })))
      setLoading(false)
    })
    return () => {
      unsub()
      unsubscribe()
      unsubRooms()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rooms an admin flagged for review from the chat header. This is a separate
  // mechanism from per-message reports — it marks a whole conversation — and
  // this is the only place the flag can be cleared.
  const flaggedRooms = rooms.filter((r) => (r.reviewers?.length ?? 0) > 0)

  const clearRoomFlag = async (roomId: string | number, roomName: string) => {
    const ok = await confirmAsync(
      `Clear the review flag on "${roomName}"? The conversation stays; only the flag is removed.`,
      { title: 'Clear flag', confirmLabel: 'Clear flag' }
    )
    if (!ok) return
    setBusy(String(roomId))
    try {
      await updateDoc(doc(db, 'rooms', String(roomId)), { reviewers: [] })
      await audit(
        'moderation.roomFlagCleared',
        `Cleared review flag on room "${roomName}"`,
        profile?.displayName ?? ''
      )
      toast('Flag cleared', 'success')
    } catch {
      toast('Failed to clear flag', 'error')
    } finally {
      setBusy(null)
    }
  }

  const nameFor = (uid: string) => {
    const u = users.find((x) => sameId(x.uid, uid))
    return u?.displayName ?? u?.email ?? uid
  }

  // Warn the offender: an in-app notification plus an audit entry, so there is
  // a record of the warning if the behaviour continues.
  const warnAuthor = async (report: ContentReport) => {
    const name = nameFor(report.authorUid)
    const ok = await confirmAsync(
      `Send ${name} a warning about this message? They will be notified that it broke the Terms of Use. The report stays open.`,
      { title: 'Warn user', confirmLabel: 'Send warning' }
    )
    if (!ok) return
    setBusy(report.id)
    try {
      const sendNotif = httpsCallable(functions, 'sendNotification')
      await sendNotif({
        uid: String(report.authorUid),
        type: 'announcement',
        data: {
          title: 'Warning from the Mission Portal team',
          body: `A message you sent was reported for "${report.reason}" and breaks the Terms of Use. Please review them. Repeated breaches can get your account removed.`,
        },
      })
      await audit(
        'moderation.userWarned',
        `Warned ${name} over a reported message (${report.reason})`,
        profile?.displayName ?? ''
      )
      toast(`${name} warned`, 'success')
    } catch {
      toast('Failed to send warning', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Remove the offender outright. Guideline 1.2 expects abusive users to be
  // ejectable, and this is the escalation from a warning.
  const removeAuthor = async (report: ContentReport) => {
    const name = nameFor(report.authorUid)
    const ok = await confirmAsync(
      `Permanently delete ${name}'s account? Their profile and messages are removed and they lose access immediately. This cannot be undone.`,
      { title: 'Remove user', confirmLabel: 'Delete account', destructive: true }
    )
    if (!ok) return
    setBusy(report.id)
    try {
      const deleteAuthAccount = httpsCallable(functions, 'deleteAuthAccount')
      await deleteAuthAccount({ uids: [String(report.authorUid)] })
      await deleteDoc(doc(db, 'users', String(report.authorUid))).catch(() => {})
      await updateDoc(
        doc(db, 'contentReports', report.id),
        resolution('actioned', profile?.uid ?? '')
      )
      await notifyReporterResolved(report)
      await audit(
        'moderation.userRemoved',
        `Deleted ${name}'s account over a reported message (${report.reason})`,
        profile?.displayName ?? ''
      )
      toast(`${name} removed`, 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to remove user', 'error')
    } finally {
      setBusy(null)
    }
  }

  const resolve = async (report: ContentReport, status: 'actioned' | 'dismissed') => {
    setBusy(report.id)
    try {
      await updateDoc(doc(db, 'contentReports', report.id), resolution(status, profile?.uid ?? ''))
      await notifyReporterResolved(report)
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
      // Purge the image too, or the content stays reachable by URL after the
      // message it belonged to is gone.
      if (report.attachment?.type === 'image' && report.attachment.name) {
        const { ref: storageRef, deleteObject } = await import('firebase/storage')
        const { storage } = await import('@/lib/firebase')
        await deleteObject(
          storageRef(storage, `rooms/${report.roomId}/attachments/${report.attachment.name}`)
        ).catch(() => {})
      }
      await updateDoc(
        doc(db, 'contentReports', report.id),
        resolution('actioned', profile?.uid ?? '')
      )
      await notifyReporterResolved(report)
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

  // Its own frame now. This used to sit inside the admin layout, which
  // supplied the title and tab bar; it lives beside the conversations it
  // moderates instead.
  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: INBOX_TITLE(profile) }} />
      <InboxTabs active="moderation" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text color={colors.textMuted} fontSize="$2" lineHeight={18}>
          Reports filed by users about messages in the app. The Terms of Use commit to acting on
          every report within {MODERATION_SLA_HOURS} hours: warn the sender, delete their account,
          remove the message, or dismiss the report if the content is fine. Whichever you choose,
          the person who reported it is told their report was reviewed — never what was decided.
        </Text>

        {/* Conversations an admin flagged from the chat header */}
        {flaggedRooms.length > 0 ? (
          <YStack gap="$2">
            <Text color={colors.text} fontSize="$3" fontWeight="700">
              🚩 Flagged conversations ({flaggedRooms.length})
            </Text>
            {flaggedRooms.map((room) => (
              <YStack
                key={String(room.id)}
                gap="$2"
                padding="$3"
                borderRadius="$3"
                backgroundColor={colors.surface}
                borderWidth={1}
                borderColor="#e67e22"
              >
                <Text color={colors.text} fontSize="$4" fontWeight="600">
                  {room.name ?? 'Conversation'}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  Flagged by {(room.reviewers ?? []).map((r) => nameFor(String(r))).join(', ')}
                  {room.members ? ` · ${room.members.length} members` : ''}
                </Text>
                <XStack gap="$2" marginTop="$1">
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/(app)/messages/${room.id}` as never)}
                  >
                    <XStack
                      height={38}
                      borderRadius={8}
                      backgroundColor={colors.primary}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color="white" fontSize="$3" fontWeight="700">
                        Open conversation
                      </Text>
                    </XStack>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => clearRoomFlag(room.id, room.name ?? 'Conversation')}
                    disabled={busy === String(room.id)}
                  >
                    <XStack
                      height={38}
                      borderRadius={8}
                      borderWidth={1}
                      borderColor={colors.border}
                      alignItems="center"
                      justifyContent="center"
                      opacity={busy === String(room.id) ? 0.5 : 1}
                    >
                      <Text color={colors.text} fontSize="$3" fontWeight="700">
                        Clear flag
                      </Text>
                    </XStack>
                  </Pressable>
                </XStack>
              </YStack>
            ))}
          </YStack>
        ) : null}

        <Text color={colors.text} fontSize="$3" fontWeight="700" marginTop="$2">
          Reported messages
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
                  {r.messageText || (r.attachment ? '(image only)' : '(no content captured)')}
                </Text>

                {/* Reported images sit behind a tap so a moderator is not shown
                  potentially graphic content without choosing to look. */}
                {r.attachment?.type === 'image' && r.attachment.url ? (
                  revealed.has(r.id) ? (
                    <YStack gap="$1" marginTop="$2">
                      {/* `src`, not `source`: Tamagui's Image never reads a
                          `source` prop — it rebuilds one from `src` and
                          overwrites whatever was passed, so `source` renders
                          an empty box the size you asked for. */}
                      <Image
                        src={r.attachment.url}
                        width={220}
                        height={165}
                        borderRadius="$2"
                        resizeMode="contain"
                      />
                      <Pressable onPress={() => toggleReveal(r.id)}>
                        <Text color={colors.primary} fontSize="$2">
                          Hide image
                        </Text>
                      </Pressable>
                    </YStack>
                  ) : (
                    <Pressable onPress={() => toggleReveal(r.id)}>
                      <XStack
                        marginTop="$2"
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        borderRadius="$2"
                        borderWidth={1}
                        borderColor={colors.border}
                        alignSelf="flex-start"
                        gap="$2"
                        alignItems="center"
                      >
                        <Text fontSize="$3">🖼</Text>
                        <Text color={colors.primary} fontSize="$2" fontWeight="600">
                          Show reported image
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                ) : r.attachment?.type === 'file' ? (
                  <Text color={colors.textMuted} fontSize="$2" marginTop="$2">
                    📎 {r.attachment.name ?? 'File attachment'}
                  </Text>
                ) : null}
              </YStack>

              {r.details ? (
                <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
                  “{r.details}”
                </Text>
              ) : null}

              {r.status === 'open' ? (
                <YStack gap="$2" marginTop="$1">
                  <XStack gap="$2">
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => warnAuthor(r)}
                      disabled={busy === r.id}
                    >
                      <XStack
                        height={38}
                        borderRadius={8}
                        borderWidth={1}
                        borderColor="#e67e22"
                        alignItems="center"
                        justifyContent="center"
                        opacity={busy === r.id ? 0.5 : 1}
                      >
                        <Text color="#e67e22" fontSize="$3" fontWeight="700">
                          ⚠️ Warn user
                        </Text>
                      </XStack>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => removeAuthor(r)}
                      disabled={busy === r.id}
                    >
                      <XStack
                        height={38}
                        borderRadius={8}
                        borderWidth={1}
                        borderColor="#c0392b"
                        alignItems="center"
                        justifyContent="center"
                        opacity={busy === r.id ? 0.5 : 1}
                      >
                        <Text color="#c0392b" fontSize="$3" fontWeight="700">
                          Delete account
                        </Text>
                      </XStack>
                    </Pressable>
                  </XStack>
                  <XStack gap="$2">
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
                </YStack>
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
    </YStack>
  )
}
