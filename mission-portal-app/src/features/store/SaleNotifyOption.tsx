import { useState } from 'react'
import { Platform, Pressable } from 'react-native'
import { doc, updateDoc } from 'firebase/firestore'
import { Text, XStack, YStack } from 'tamagui'
import { db } from '@/lib/firebase'
import { registerForPushNotifications, persistPushToken } from '@/lib/notifications'
import { useAuthStore } from '@/stores/authStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import { wantsSaleNotifications } from './storeSale'

/**
 * Ask to be told when the Elim Store starts a new sale, or stop being told.
 *
 * Opt-in, as stream alerts are: nobody is sent one until they say yes. On a
 * phone a yes also asks the operating system for permission, the way
 * StreamNotifyPrompt does, and only then. A browser has no push here, so on
 * the web the choice is saved and the card says where the alerts will arrive.
 * The same switch is in Settings.
 */
export function SaleNotifyOption() {
  const colors = useThemeColors()
  const { profile, fbUser } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const onPrimary = useThemeStore((s) => s.theme.onPrimaryOverride) ?? autoTextColor(colors.primary)

  if (!fbUser || !profile) return null
  const on = wantsSaleNotifications(profile.notificationPrefs)

  const choose = async (wants: boolean) => {
    setBusy(true)
    setNote(null)
    try {
      if (wants && Platform.OS !== 'web') {
        const result = await registerForPushNotifications()
        if (result) {
          await persistPushToken(fbUser.uid, result.token, result.platform)
        } else {
          setNote(
            'Saved — but notifications are turned off for this app. Turn them on in your device settings to receive them.'
          )
        }
      }
      await updateDoc(doc(db, 'users', fbUser.uid), {
        'notificationPrefs.storeSale': { push: wants, email: false },
      })
    } catch {
      setNote('Could not save that. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack
      padding={18}
      gap={10}
      borderRadius={16}
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <XStack gap={10} alignItems="center">
        <Text fontSize={20}>{on ? '🔔' : '🛍️'}</Text>
        <Text flex={1} color={colors.text} fontSize={17} fontWeight="800">
          {on ? 'You’ll hear about new sales' : 'Hear about sales first'}
        </Text>
      </XStack>
      <Text color={colors.textMuted} fontSize={15} lineHeight={22}>
        {on
          ? 'We’ll send a notification when the Elim Store starts a new sale.'
          : 'Get a notification when the Elim Store starts a new sale. Nothing else, and you can turn it off here or in Settings.'}
      </Text>
      {Platform.OS === 'web' ? (
        <Text color={colors.textMuted} fontSize={13} lineHeight={19}>
          Notifications arrive through the Mission Portal app on your phone.
        </Text>
      ) : null}
      {note ? (
        <Text color={colors.textMuted} fontSize={13}>
          {note}
        </Text>
      ) : null}
      <XStack marginTop={4}>
        <Pressable
          onPress={() => choose(!on)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={on ? 'Stop sale notifications' : 'Notify me about sales'}
        >
          <XStack
            paddingHorizontal={16}
            paddingVertical={10}
            borderRadius={999}
            backgroundColor={on ? 'transparent' : colors.primary}
            borderWidth={on ? 1 : 0}
            borderColor={colors.border}
            opacity={busy ? 0.6 : 1}
          >
            <Text color={on ? colors.text : onPrimary} fontSize={14} fontWeight="700">
              {on ? 'Turn off' : 'Notify me about sales'}
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  )
}
