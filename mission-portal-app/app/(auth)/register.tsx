import { useState } from 'react'
import { useRouter, Link } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { YStack, XStack, H1, Paragraph, Button, Input, Text } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

const schema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

export default function RegisterScreen() {
  const router = useRouter()
  const signUp = useAuthStore((s) => s.signUp)
  const { toast } = useUIStore()
  const [loading, setLoading] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await signUp(data.email, data.password, data.displayName)
      router.replace('/(auth)/verify-email')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" justifyContent="center" gap="$4">
        <H1>Create account</H1>
        <Paragraph color="$colorMuted">Join the Mission Portal team</Paragraph>

        <YStack gap="$3">
          <Controller
            control={control}
            name="displayName"
            render={({ field }) => (
              <YStack gap="$1">
                <Input
                  placeholder="Your name"
                  autoCapitalize="words"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  borderColor={errors.displayName ? '$red9' : '$borderColor'}
                />
                {errors.displayName && (
                  <Text color="$red9" fontSize="$2">
                    {errors.displayName.message}
                  </Text>
                )}
              </YStack>
            )}
          />

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
                  placeholder="Password (min 8 chars)"
                  secureTextEntry
                  autoComplete="new-password"
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

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field }) => (
              <YStack gap="$1">
                <Input
                  placeholder="Confirm password"
                  secureTextEntry
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  borderColor={errors.confirmPassword ? '$red9' : '$borderColor'}
                />
                {errors.confirmPassword && (
                  <Text color="$red9" fontSize="$2">
                    {errors.confirmPassword.message}
                  </Text>
                )}
              </YStack>
            )}
          />
        </YStack>

        <Button
          backgroundColor="$primary"
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          opacity={loading ? 0.7 : 1}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </Button>

        <XStack justifyContent="center" gap="$2">
          <Paragraph color="$colorMuted">Already have an account?</Paragraph>
          <Link href="/(auth)/login">
            <Text color="$primary">Sign in</Text>
          </Link>
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}
