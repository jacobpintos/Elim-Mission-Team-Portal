import { useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { blockUser, unblockUser } from '@/lib/moderation'
import { sameId } from '@/lib/ids'
import type { UserProfile } from '@/types/user'

interface RoomMembersSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberUids: (string | number)[]
  users: UserProfile[]
  viewerUid: string
  blockedUsers: string[]
}

/**
 * The people in a conversation, each with a block control.
 *
 * Blocking is also available from any individual message, but that requires the
 * person to have said something first. Someone can be abusive in a room you
 * created, or need blocking before they post again, so the roster is the
 * reliable entry point — it does not depend on who created the room.
 */
export function RoomMembersSheet({
  open,
  onOpenChange,
  memberUids,
  users,
  viewerUid,
  blockedUsers,
}: RoomMembersSheetProps) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [busy, setBusy] = useState<string | null>(null)

  const isBlocked = (uid: string) => blockedUsers.some((b) => sameId(b, uid))

  const handleToggleBlock = async (uid: string, name: string) => {
    const blocked = isBlocked(uid)
    const ok = await confirmAsync(
      blocked
        ? `Unblock ${name}? You will see their messages again.`
        : `Block ${name}? You will stop seeing their messages everywhere in the app, including in conversations created later.`,
      {
        title: blocked ? 'Unblock user' : 'Block user',
        confirmLabel: blocked ? 'Unblock' : 'Block',
        destructive: !blocked,
      }
    )
    if (!ok) return
    setBusy(uid)
    try {
      if (blocked) {
        await unblockUser(viewerUid, uid)
        toast(`${name} unblocked`, 'success')
      } else {
        await blockUser(viewerUid, uid)
        toast(`${name} blocked`, 'success')
      }
    } catch {
      toast('Failed to update block list', 'error')
    } finally {
      setBusy(null)
    }
  }

  const others = memberUids.map(String).filter((uid) => !sameId(uid, viewerUid))

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="People in this conversation">
      <YStack gap="$1" paddingVertical="$2">
        <Text color={colors.textMuted} fontSize="$2" marginBottom="$2">
          Blocking hides someone’s messages from you. They are not told, and it works in every
          conversation — including ones created later.
        </Text>

        {others.length === 0 ? (
          <YStack paddingVertical="$5" alignItems="center">
            <Text color={colors.textMuted}>No one else is in this conversation.</Text>
          </YStack>
        ) : (
          others.map((uid) => {
            const u = users.find((x) => sameId(x.uid, uid))
            const name = u?.displayName ?? u?.email ?? uid
            const blocked = isBlocked(uid)
            return (
              <XStack key={uid} alignItems="center" gap="$3" paddingVertical="$2">
                <Avatar uri={u?.photoURL} displayName={name} size={36} />
                <YStack flex={1}>
                  <Text color={colors.text} fontSize="$4" numberOfLines={1}>
                    {name}
                  </Text>
                  {blocked ? (
                    <Text color="#c0392b" fontSize="$1">
                      Blocked
                    </Text>
                  ) : null}
                </YStack>
                <Pressable
                  onPress={() => handleToggleBlock(uid, name)}
                  disabled={busy === uid}
                  hitSlop={8}
                >
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={blocked ? colors.border : '#c0392b'}
                    opacity={busy === uid ? 0.5 : 1}
                  >
                    <Text color={blocked ? colors.text : '#c0392b'} fontSize="$3" fontWeight="600">
                      {busy === uid ? '…' : blocked ? 'Unblock' : 'Block'}
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
            )
          })
        )}
      </YStack>
    </Modal>
  )
}
