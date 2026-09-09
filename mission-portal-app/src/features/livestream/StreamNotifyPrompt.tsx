import { useState } from 'react'
import { Platform, Pressable } from 'react-native'
import { doc, updateDoc } from 'firebase/firestore'
import { YStack, XStack, Text } from 'tamagui'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { shouldAskAboutStreamNotifications } from '@/lib/streamNotify'
import { registerForPushNotifications, persistPushToken } from '@/lib/notifications'

/**
 * Asks, once, whether to send a push when a service goes live.
 *
 * Every other notification in the app is on by default and turned off in
 * Settings. This one is the other way round, and the asking is the feature:
 * a Sunday-morning push about a service starting is unwelcome if nobody
 * offered a say in it, and a permission dialog raised out of nowhere at app
 * launch gets denied on reflex — which is unrecoverable without a trip to the
 * device settings.
 *
 * So the choice is put in plain words first, and only a yes reaches the
 * operating system's own prompt.
 */
export function StreamNotifyPrompt() {
  const colors = useThemeColors()
  const { profile, fbUser } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Push is a native capability here — registerForPushNotifications returns
  // null on web without asking anything — so there is nothing to offer a
  // browser, and a prompt it could only answer pointlessly is worse than none.
  if (Platform.OS === 'web') return null
  if (!fbUser || !profile) return null
  if (!shouldAskAboutStreamNotifications(profile.notificationPrefs)) return null

  const answer = async (wants: boolean) => {
    setBusy(true)
    try {
      if (wants) {
        const result = await registerForPushNotifications()
        if (result) {
          await persistPushToken(fbUser.uid, result.token, result.platform)
        } else {
          // Their answer still stands and is still recorded — the block is at
          // the OS, not here. Saying so beats a prompt that appears to work
          // and then silently never delivers.
          setNote(
            'Saved — but notifications are turned off for this app. Turn them on in your device settings to receive them.'
          )
        }
      }
      await updateDoc(doc(db, 'users', fbUser.uid), {
        'notificationPrefs.livestream': { push: wants, email: false },
      })
    } catch {
      setNote('Could not save that. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack
      margin="$4"
      marginBottom="$0"
      padding="$3"
      gap="$2"
      borderRadius="$4"
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <Text color={colors.text} fontSize="$4" fontWeight="700">
        Get told when a service goes live?
      </Text>
      <Text color={colors.textMuted} fontSize="$3">
        We will send one notification when a Sunday service or worship event starts streaming.
        Nothing else, and you can change this any time in Settings.
      </Text>
      {note ? (
        <Text color={colors.textMuted} fontSize="$2">
          {note}
        </Text>
      ) : null}
      <XStack gap="$3" marginTop="$1">
        <Pressable onPress={() => answer(true)} disabled={busy}>
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$2"
            borderRadius="$2"
            backgroundColor={colors.primary}
            opacity={busy ? 0.6 : 1}
          >
            <Text color="white" fontSize="$3" fontWeight="600">
              Notify me
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={() => answer(false)} disabled={busy}>
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$2"
            borderRadius="$2"
            borderWidth={1}
            borderColor={colors.border}
            opacity={busy ? 0.6 : 1}
          >
            <Text color={colors.text} fontSize="$3">
              No thanks
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  )
}
