import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { doc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { isAdmin } from '@/lib/roles'
import { confirmAsync } from '@/lib/confirm'
import { useAuthStore } from '@/stores/authStore'
import { useMeetingRequestsStore } from '@/stores/meetingRequestsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useTasksStore } from '@/stores/tasksStore'
import type { Task } from '@/types/events'
import type { MeetingBlock, MeetingRequest } from '@/types/meeting'
import { useThemeColors } from '@/theme/useThemeColors'

const BLOCK_RED = '#c0392b'

/**
 * The request behind a task, read on its own.
 *
 * By id rather than from the store's list, which holds only the requests
 * naming whoever is signed in: an admin who was not asked would otherwise see
 * the task and nothing of what it is about. The rules still decide — anyone
 * else is refused, and gets null.
 */
function useMeetingRequest(id: string | undefined): MeetingRequest | null {
  const [request, setRequest] = useState<MeetingRequest | null>(null)
  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(db, 'meetingRequests', id),
      (snap) =>
        setRequest(snap.exists() ? ({ ...snap.data(), id: snap.id } as MeetingRequest) : null),
      () => setRequest(null)
    )
  }, [id])
  return request
}

/** Whether the sender is blocked, for an admin; undefined until it is known. */
function useMeetingBlock(uid: string | undefined, enabled: boolean) {
  const [block, setBlock] = useState<MeetingBlock | null | undefined>(undefined)
  useEffect(() => {
    if (!uid || !enabled) return
    return onSnapshot(
      doc(db, 'meetingBlocks', uid),
      (snap) => setBlock(snap.exists() ? (snap.data() as MeetingBlock) : null),
      () => setBlock(undefined)
    )
  }, [uid, enabled])
  return block
}

const sentAt = (ts: number) =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * The meeting request behind a task: everything the form said, and the
 * handling of it.
 *
 * Shown inside the task itself rather than on a screen of its own. The task is
 * where somebody goes to see what they have to do, and a request that lived
 * anywhere else would be a second place to remember to look. It is also the
 * only place the request is answered from — nothing sends or drafts an email.
 *
 * The details stay on the request rather than being copied onto the task,
 * because every account can read every task and only admins and the people
 * asked can read the request.
 *
 * Renders nothing when the request cannot be read, or has since been deleted.
 */
export function MeetingRequestPanel({ task }: { task: Task }) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const claim = useMeetingRequestsStore((s) => s.claim)
  const blockSender = useMeetingRequestsStore((s) => s.block)
  const unblockSender = useMeetingRequestsStore((s) => s.unblock)
  const nameOf = useUsersStore((s) => s.displayName)
  const setStatus = useTasksStore((s) => s.setStatus)
  const [busy, setBusy] = useState(false)

  const request = useMeetingRequest(task.meetingRequestId)
  const admin = isAdmin(profile)
  // Never on an admin's own request: nothing to gain, and a way to lock
  // themselves out of the form.
  const canBlock = admin && !!request && request.fromUid !== profile?.uid
  const block = useMeetingBlock(request?.fromUid, canBlock)

  if (!request) return null

  const claimedByMe = !!profile && request.claimedBy === profile.uid
  const claimed = !!request.claimedBy
  // Requests sent before the names were kept carry only uids.
  const askedToMeet = request.leaderNames?.length
    ? request.leaderNames
    : request.leaders.map((uid) => nameOf(uid))
  // Who did it is on the request it was done from; from another of their
  // requests, this one does not know.
  const blockedHere = !!block && block.requestId === request.id

  /** Take the request on: tell the others, and move the task along. */
  const onIt = async () => {
    if (!profile) return
    try {
      await claim(request.id, profile.uid, profile.displayName)
      if (task.status !== 'in_progress' && task.status !== 'done') {
        await setStatus(task.id, 'in_progress')
      }
    } catch {
      toast('Could not take this on. Please try again.', 'error')
    }
  }

  const onBlock = async () => {
    if (!profile || busy) return
    const ok = await confirmAsync(
      `${request.fromName} won’t be able to send any more meeting requests. They’ll see a note saying so instead of the form. You can undo this here.`,
      { title: 'Block meeting requests?', confirmLabel: 'Block', destructive: true }
    )
    if (!ok) return
    setBusy(true)
    try {
      await blockSender(request, profile.uid, profile.displayName)
      toast(`${request.fromName} can no longer request meetings.`, 'success')
    } catch {
      toast('Could not block them. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onUnblock = async () => {
    if (busy) return
    const ok = await confirmAsync(`${request.fromName} will be able to request meetings again.`, {
      title: 'Unblock?',
      confirmLabel: 'Unblock',
    })
    if (!ok) return
    setBusy(true)
    try {
      await unblockSender(request)
      toast(`${request.fromName} can request meetings again.`, 'success')
    } catch {
      toast('Could not unblock them. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const row = (label: string, value: string) => (
    <YStack gap="$0.5">
      <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
        {label}
      </Text>
      <Text color={colors.text} fontSize="$3" selectable>
        {value}
      </Text>
    </YStack>
  )

  return (
    <YStack
      padding="$3"
      gap="$2"
      // A rule rather than a frame. This sits inside the task's own card, so a
      // border of its own would draw a second card and the pair would read as
      // two separate tasks.
      borderTopWidth={1}
      borderTopColor={colors.border}
    >
      {row('Name', request.fromName)}
      {request.fromEmail ? row('Email', request.fromEmail) : null}
      {askedToMeet.length ? row('Asked to meet', askedToMeet.join(', ')) : null}
      {row('Available', request.availability)}
      {request.message ? row('Message', request.message) : null}
      {request.createdAt ? row('Sent', sentAt(request.createdAt)) : null}

      {claimed ? (
        <Text color={colors.primary} fontSize="$2" fontWeight="600">
          {claimedByMe ? 'You are on it.' : `${request.claimedByName ?? 'Someone'} is on it.`}
        </Text>
      ) : (
        <>
          <XStack marginTop="$1">
            <Pressable onPress={onIt} accessibilityRole="button">
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$2"
                backgroundColor={colors.primary}
              >
                <Text color="white" fontSize="$2" fontWeight="700">
                  I&rsquo;m on it
                </Text>
              </XStack>
            </Pressable>
          </XStack>
          <Text color={colors.textMuted} fontSize="$1">
            Tells the others you have this and moves the task to in progress.
          </Text>
        </>
      )}

      {/* Admins only, and only once it is known whether they are blocked, so
          the button never offers the opposite of what is true. */}
      {canBlock && block !== undefined ? (
        <YStack
          gap="$1.5"
          marginTop="$2"
          paddingTop="$2.5"
          borderTopWidth={1}
          borderTopColor={colors.border}
        >
          {block ? (
            <Text color={BLOCK_RED} fontSize="$2" fontWeight="600">
              {blockedHere && request.blockedByName
                ? `Blocked from requesting meetings by ${request.blockedByName}.`
                : 'Blocked from requesting meetings.'}
            </Text>
          ) : null}
          <XStack>
            <Pressable
              onPress={block ? onUnblock : onBlock}
              disabled={busy}
              accessibilityRole="button"
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                borderRadius="$2"
                borderWidth={1}
                borderColor={block ? colors.border : BLOCK_RED}
                opacity={busy ? 0.5 : 1}
              >
                <Text color={block ? colors.text : BLOCK_RED} fontSize="$2" fontWeight="600">
                  {block ? 'Unblock' : 'Block further requests'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
          {!block ? (
            <Text color={colors.textMuted} fontSize="$1">
              Stops {request.fromName} from sending any more meeting requests.
            </Text>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  )
}
