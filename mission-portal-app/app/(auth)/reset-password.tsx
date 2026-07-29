import { useState } from 'react'
import { Link } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { YStack, XStack, H1, Paragraph, Button, Input, Text } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordScreen() {
  const resetPassword = useAuthStore((s) => s.resetPassword)
  const { toast } = useUIStore()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

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
      setSent(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" justifyContent="center" gap="$4">
        <H1>Reset password</H1>

        {sent ? (
          <YStack gap="$3">
            <Paragraph color="$green9">
              A password reset link has been sent to your email address.
            </Paragraph>
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
    </SafeAreaView>
  )
}
