import { useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button } from 'tamagui'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useBackTo } from '@/lib/useBackTo'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { confirmAsync } from '@/lib/confirm'

/**
 * Account deletion, required by App Store Review Guideline 5.1.1(v).
 *
 * Deliberately on its own screen rather than beneath Sign out in Settings — the
 * two are both irreversible-looking red buttons, and putting them next to each
 * other invites a misclick on the one that cannot be undone.
 */
export default function DeleteAccountScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const goBack = useBackTo('/(app)/settings')
  const { fbUser, profile, signOutNow } = useAuthStore()
  const { toast } = useUIStore()

  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!fbUser || !profile) return null

  const handleDelete = async () => {
    if (!password) {
      toast('Enter your password to confirm', 'error')
      return
    }
    const ok = await confirmAsync(
      'This permanently deletes your account, your profile, your messages and your notification settings. It cannot be undone.',
      { title: 'Delete account?', confirmLabel: 'Delete', destructive: true }
    )
    if (!ok) return

    setDeleting(true)
    try {
      // Firebase requires a recent credential before it will delete an account.
      const credential = EmailAuthProvider.credential(fbUser.email!, password)
      await reauthenticateWithCredential(fbUser, credential)
      const deleteOwnAccount = httpsCallable(functions, 'deleteOwnAccount')
      await deleteOwnAccount()
      toast('Your account has been deleted', 'success')
      await signOutNow()
      router.replace('/(auth)/login')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account'
      toast(message, 'error')
      setDeleting(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Delete account' }} />

      {/* ScreenTitle is a no-op on web, so this screen needs its own way back. */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Button
          size="$4"
          variant="outlined"
          onPress={goBack}
          disabled={deleting}
          minHeight={44}
          paddingHorizontal="$4"
          cursor="pointer"
        >
          ← Back
        </Button>
        <Text color={colors.text} fontSize={18} fontWeight="700" flex={1}>
          Delete account
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <YStack
          gap="$3"
          padding="$4"
          borderRadius="$4"
          backgroundColor={colors.surface}
          borderWidth={1}
          borderColor="#c0392b"
        >
          <Text color="#c0392b" fontSize="$5" fontWeight="800">
            This cannot be undone
          </Text>
          <Text color={colors.text} fontSize="$3" lineHeight={21}>
            Deleting your account permanently removes:
          </Text>
          <YStack gap="$1.5" paddingLeft="$2">
            {[
              'Your profile and profile photo',
              'The messages you have sent in team chats',
              'Your notification settings and saved location',
              'Your access to the Mission Portal',
            ].map((line) => (
              <XStack key={line} gap="$2">
                <Text color={colors.textMuted} fontSize="$3">
                  •
                </Text>
                <Text color={colors.text} fontSize="$3" lineHeight={21} flex={1}>
                  {line}
                </Text>
              </XStack>
            ))}
          </YStack>
          <Text color={colors.textMuted} fontSize="$2" lineHeight={18}>
            Shared team records such as events and tasks are kept, but you are removed from them. If
            you only want to stop receiving notifications, you can turn them off in Profile &amp;
            Settings instead.
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text color={colors.textMuted} fontSize="$2">
            Confirm your password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
          <Text color={colors.textMuted} fontSize="$1">
            Signed in as {profile.email}
          </Text>
        </YStack>

        <YStack gap="$3">
          <Pressable onPress={handleDelete} disabled={deleting || !password}>
            <View
              style={[
                styles.btn,
                { backgroundColor: '#c0392b', opacity: deleting || !password ? 0.5 : 1 },
              ]}
            >
              <Text color="white" fontWeight="700" fontSize="$4">
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={goBack} disabled={deleting}>
            <View style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}>
              <Text color={colors.text} fontWeight="700" fontSize="$4">
                Cancel
              </Text>
            </View>
          </Pressable>
        </YStack>
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  btn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
