import { useEffect } from 'react'
import { Linking, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useMeetingRequestsStore } from '@/stores/meetingRequestsStore'
import { useUIStore } from '@/stores/uiStore'
import { meetingReplyMailto } from '@/lib/meetingMailto'
import { useTasksStore } from '@/stores/tasksStore'
import type { Task } from '@/types/events'
import { useThemeColors } from '@/theme/useThemeColors'

/**
 * The meeting request behind a task, and the reply to it.
 *
 * Shown inside the task itself rather than on a screen of its own. The task is
 * where somebody goes to see what they have to do, and a request that lived
 * anywhere else would be a second place to remember to look.
 *
 * Renders nothing when the request cannot be found — an admin who is not one
 * of the named leaders sees the task without it, and so does anyone looking at
 * a request that has since been deleted.
 */
export function MeetingRequestPanel({ task }: { task: Task }) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { subscribe, unsubscribe } = useMeetingRequestsStore()
  const requests = useMeetingRequestsStore((s) => s.requests)
  const claim = useMeetingRequestsStore((s) => s.claim)
  const setStatus = useTasksStore((s) => s.setStatus)

  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])

  const request = requests.find((r) => r.id === task.meetingRequestId)
  if (!request) return null

  const claimedByMe = !!profile && request.claimedBy === profile.uid
  const claimed = !!request.claimedBy

  /** Open the draft. Never changes who has the request or what state it is in. */
  const openReply = async () => {
    const url = meetingReplyMailto(request, profile?.displayName)
    try {
      // Checked first because a device with no mail account configured has
      // nothing to hand this to, and openURL fails in a way that reads like the
      // button is broken rather than like there is no mail app.
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        toast(`No mail app is set up. Write to ${request.fromEmail}`, 'info')
        return
      }
      await Linking.openURL(url)
    } catch {
      toast(`Could not open a mail app. Write to ${request.fromEmail}`, 'error')
    }
  }

  /**
   * Take the request on: say so, move the task, then open the draft.
   *
   * In that order. Saying who is on it is the part the others are waiting to
   * see, and it should not depend on whether a mail app opened — somebody who
   * taps this on a device with no mail set up has still taken the request, and
   * is told where to write instead.
   */
  const onIt = async () => {
    if (!profile) return
    try {
      await claim(request.id, profile.uid, profile.displayName)
      if (task.status !== 'in_progress' && task.status !== 'done') {
        await setStatus(task.id, 'in_progress')
      }
    } catch {
      toast('Could not take this on. Please try again.', 'error')
      return
    }
    await openReply()
  }

  const row = (label: string, value: string) => (
    <YStack gap="$0.5">
      <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
        {label}
      </Text>
      <Text color={colors.text} fontSize="$3">
        {value}
      </Text>
    </YStack>
  )

  return (
    <YStack
      marginTop="$2"
      padding="$3"
      gap="$2"
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      {row('From', `${request.fromName} · ${request.fromEmail}`)}
      {row('Available', request.availability)}
      {request.message ? row('Message', request.message) : null}

      {claimed ? (
        <Text color={colors.primary} fontSize="$2" fontWeight="600">
          {claimedByMe ? 'You are on it.' : `${request.claimedByName ?? 'Someone'} is on it.`}
        </Text>
      ) : null}

      <XStack gap="$2" marginTop="$1" flexWrap="wrap">
        {/* Once somebody has it, the claim is made and the button that makes it
            would only muddy who holds the request. What is left is the draft,
            which anyone asked may still want — to follow up, or because the
            person on it asked them to. */}
        {!claimed ? (
          <Pressable onPress={onIt}>
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
        ) : null}
        <Pressable onPress={openReply}>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$2"
            borderWidth={1}
            borderColor={colors.border}
          >
            <Text color={colors.text} fontSize="$2" fontWeight="600">
              ✉ Reply by email
            </Text>
          </XStack>
        </Pressable>
      </XStack>
      <Text color={colors.textMuted} fontSize="$1">
        {claimed
          ? 'Opens your mail app with a draft you can change. Everyone else who was asked is copied in.'
          : 'Tells the others you have this, moves the task to in progress, and opens your mail app with a draft.'}
      </Text>
    </YStack>
  )
}
