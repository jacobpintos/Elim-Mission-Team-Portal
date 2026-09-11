import { useEffect } from 'react'
import { Linking, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useMeetingRequestsStore } from '@/stores/meetingRequestsStore'
import { useUIStore } from '@/stores/uiStore'
import { meetingReplyMailto } from '@/lib/meetingMailto'
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
export function MeetingRequestPanel({ requestId }: { requestId: string }) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { subscribe, unsubscribe } = useMeetingRequestsStore()
  const requests = useMeetingRequestsStore((s) => s.requests)
  const markHandled = useMeetingRequestsStore((s) => s.markHandled)

  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])

  const request = requests.find((r) => r.id === requestId)
  if (!request) return null

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
      if (request.status === 'open' && profile) {
        await markHandled(request.id, profile.uid, profile.displayName)
      }
    } catch {
      toast(`Could not open a mail app. Write to ${request.fromEmail}`, 'error')
    }
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

      {request.status === 'handled' ? (
        <Text color={colors.textMuted} fontSize="$2">
          {request.handledByName
            ? `${request.handledByName} has replied.`
            : 'Somebody has replied.'}
        </Text>
      ) : null}

      <XStack gap="$2" marginTop="$1">
        <Pressable onPress={openReply}>
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$2"
            backgroundColor={colors.primary}
          >
            <Text color="white" fontSize="$2" fontWeight="600">
              ✉ Reply by email
            </Text>
          </XStack>
        </Pressable>
      </XStack>
      <Text color={colors.textMuted} fontSize="$1">
        Opens your mail app with a draft you can change. Everyone else who was asked is copied in.
      </Text>
    </YStack>
  )
}
