import { useState } from 'react'
import { useRouter, Link } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { YStack, XStack, H1, Paragraph, Button, Input, Text } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormData = z.infer<typeof schema>

export default function LoginScreen() {
  const router = useRouter()
  const signIn = useAuthStore((s) => s.signIn)
  const { toast } = useUIStore()
  const [loading, setLoading] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await signIn(data.email, data.password)
      router.replace('/')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      const message =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Incorrect email or password.'
          : code === 'auth/user-not-found'
            ? 'No account found with that email.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Try again later.'
              : code === 'auth/network-request-failed'
                ? 'Network error. Check your connection.'
                : code === 'auth/user-disabled'
                  ? 'This account has been disabled.'
                  : 'Sign in failed. Please try again.'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" justifyContent="center" gap="$4">
        <H1>Welcome back</H1>
        <Paragraph color="$colorMuted">Sign in to Mission Portal</Paragraph>

        <YStack gap="$3">
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

          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <YStack gap="$1">
                <Input
                  placeholder="Password"
                  secureTextEntry
                  autoComplete="password"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  borderColor={errors.password ? '$red9' : '$borderColor'}
                />
                {errors.password && (
                  <Text color="$red9" fontSize="$2">
                    {errors.password.message}
                  </Text>
                )}
              </YStack>
            )}
          />
        </YStack>

        <Button
          theme="active"
          backgroundColor="$primary"
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          opacity={loading ? 0.7 : 1}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>

        <XStack justifyContent="center" gap="$2">
          <Paragraph color="$colorMuted">Don&apos;t have an account?</Paragraph>
          <Link href="/(auth)/register">
            <Text color="$primary">Register</Text>
          </Link>
        </XStack>

        <XStack justifyContent="center">
          <Link href="/(auth)/reset-password">
            <Text color="$colorMuted" fontSize="$3">
              Forgot password?
            </Text>
          </Link>
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}
