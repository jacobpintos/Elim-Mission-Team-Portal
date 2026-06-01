import { useState } from 'react'
import { useRouter } from 'expo-router'
import { YStack, H1, Paragraph, Button } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

export default function VerifyEmailScreen() {
  const router = useRouter()
  const { fbUser, resendVerification, signOutNow } = useAuthStore()
  const { toast } = useUIStore()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleResend = async () => {
    setLoading(true)
    try {
      await resendVerification()
      toast('Verification email sent!', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend verification email'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckVerified = async () => {
    setChecking(true)
    try {
      await fbUser?.reload()
      if (fbUser?.emailVerified) {
        router.replace('/')
      } else {
        toast('Email not yet verified. Please check your inbox.', 'info')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check verification status'
      toast(message, 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" justifyContent="center" gap="$4">
        <H1>Verify your email</H1>
        <Paragraph color="$colorMuted">
          We sent a verification link to <Paragraph fontWeight="bold">{fbUser?.email}</Paragraph>.
          {'\n\n'}Check your inbox and your{' '}
          <Paragraph fontWeight="bold">spam/junk folder</Paragraph> if you don&apos;t see it within
          a minute. The email comes from a Firebase no-reply address.
        </Paragraph>

        <Button
          theme="active"
          backgroundColor="$primary"
          onPress={handleCheckVerified}
          disabled={checking}
          opacity={checking ? 0.7 : 1}
        >
          {checking ? 'Checking…' : "I've verified my email"}
        </Button>

        <Button
          variant="outlined"
          onPress={handleResend}
          disabled={loading}
          opacity={loading ? 0.7 : 1}
        >
          {loading ? 'Sending…' : 'Resend verification email'}
        </Button>

        <Button
          variant="outlined"
          onPress={async () => {
            await signOutNow()
            router.replace('/(auth)/login')
          }}
        >
          Sign out
        </Button>
      </YStack>
    </SafeAreaView>
  )
}
