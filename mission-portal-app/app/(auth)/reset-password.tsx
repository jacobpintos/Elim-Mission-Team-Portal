import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Link } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { YStack, XStack, H1, Paragraph, Button, Input, Text } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useLightModeScreen } from '@/theme/useLightModeScreen'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordScreen() {
  useLightModeScreen()
  const resetPassword = useAuthStore((s) => s.resetPassword)
  const { toast } = useUIStore()
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await resetPassword(data.email)
      setSentTo(data.email.trim())
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      const message =
        code === 'auth/invalid-email'
          ? 'That does not look like an email address.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Try again later.'
            : code === 'auth/network-request-failed'
              ? 'Network error. Check your connection.'
              : 'Could not send the reset link. Please try again.'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* Without this the keyboard covers the fields below whatever is focused:
          the form is vertically centred with no scroll, so on a phone the
          password field and Sign in button sit underneath the keyboard with no
          way to reach them. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <YStack padding="$6" gap="$4">
            <H1>Reset password</H1>

            {sentTo ? (
              <YStack gap="$3">
                {/* Firebase answers the same way whether or not the address
                    has an account — deliberately, so that this screen cannot
                    be used to find out who has one. Claiming a link was sent
                    would therefore be untrue half the time, and someone who
                    mistyped their address would sit waiting for an email that
                    was never going to arrive. */}
                <Paragraph color="$green9">
                  If an account exists for {sentTo}, a link to reset its password is on its way.
                </Paragraph>
                <Paragraph color="$colorMuted" fontSize="$3">
                  It can take a minute to arrive, and it sometimes lands in spam. Nothing will be
                  sent if that address has no account here.
                </Paragraph>
                <Button chromeless onPress={() => setSentTo(null)} alignSelf="flex-start">
                  <Text color="$primary">Try a different address</Text>
                </Button>
                <Link href="/(auth)/login">
                  <Text color="$primary">Back to sign in</Text>
                </Link>
              </YStack>
            ) : (
              <YStack gap="$3">
                <Paragraph color="$colorMuted">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </Paragraph>

                <Controller
                  control={control}
                  name="email"
                  render={({ field }) => (
                    <YStack gap="$1">
                      <Input
                        placeholder="Email"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        returnKeyType="go"
                        onSubmitEditing={() => void handleSubmit(onSubmit)()}
                        borderColor={errors.email ? '$red9' : '$borderColor'}
                      />
                      {errors.email && (
                        <Text color="$red9" fontSize="$2">
                          {errors.email.message}
                        </Text>
                      )}
                    </YStack>
                  )}
                />

                <Button
                  theme="active"
                  backgroundColor="$primary"
                  onPress={handleSubmit(onSubmit)}
                  disabled={loading}
                  opacity={loading ? 0.7 : 1}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>

                <XStack justifyContent="center">
                  <Link href="/(auth)/login">
                    <Text color="$colorMuted" fontSize="$3">
                      Back to sign in
                    </Text>
                  </Link>
                </XStack>
              </YStack>
            )}
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
