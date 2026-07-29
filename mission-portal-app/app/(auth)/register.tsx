import { useState } from 'react'
import { useRouter, Link } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { YStack, XStack, H1, Paragraph, Button, Input, Text, View } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { TERMS_VERSION } from './terms'

const schema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    ageConfirm: z.boolean().refine((v) => v === true, {
      message: 'You must confirm you are 13 or older to register',
    }),
    // App Store Review Guideline 1.2 requires users of a UGC app to agree to
    // terms that forbid objectionable content and abusive behaviour.
    termsAccept: z.boolean().refine((v) => v === true, {
      message: 'You must accept the Terms of Use to register',
    }),
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
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      ageConfirm: false,
      termsAccept: false,
    },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await signUp(data.email, data.password, data.displayName, TERMS_VERSION)
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

          <Controller
            control={control}
            name="ageConfirm"
            render={({ field }) => (
              <YStack gap="$1">
                <XStack
                  gap="$2.5"
                  alignItems="center"
                  onPress={() => field.onChange(!field.value)}
                  cursor="pointer"
                >
                  <View
                    width={22}
                    height={22}
                    borderRadius={6}
                    borderWidth={2}
                    borderColor={
                      field.value ? '$primary' : errors.ageConfirm ? '$red9' : '$borderColor'
                    }
                    backgroundColor={field.value ? '$primary' : 'transparent'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {field.value ? (
                      <Text color="white" fontSize={13} fontWeight="900">
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text color="$colorMuted" fontSize="$3" flex={1}>
                    I confirm I am 13 years of age or older
                  </Text>
                </XStack>
                {errors.ageConfirm && (
                  <Text color="$red9" fontSize="$2">
                    {errors.ageConfirm.message}
                  </Text>
                )}
              </YStack>
            )}
          />

          <Controller
            control={control}
            name="termsAccept"
            render={({ field }) => (
              <YStack gap="$1">
                <XStack gap="$2.5" alignItems="center">
                  <View
                    onPress={() => field.onChange(!field.value)}
                    cursor="pointer"
                    width={22}
                    height={22}
                    borderRadius={6}
                    borderWidth={2}
                    borderColor={
                      field.value ? '$primary' : errors.termsAccept ? '$red9' : '$borderColor'
                    }
                    backgroundColor={field.value ? '$primary' : 'transparent'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {field.value ? (
                      <Text color="white" fontSize={13} fontWeight="900">
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text color="$colorMuted" fontSize="$3" flex={1}>
                    I agree to the{' '}
                    <Text
                      color="$primary"
                      textDecorationLine="underline"
                      onPress={() => router.push('/(auth)/terms')}
                    >
                      Terms of Use
                    </Text>{' '}
                    and{' '}
                    <Text
                      color="$primary"
                      textDecorationLine="underline"
                      onPress={() => router.push('/(auth)/privacy')}
                    >
                      Privacy Policy
                    </Text>
                    . I understand that objectionable content and abusive behaviour are not
                    tolerated and can get my account removed.
                  </Text>
                </XStack>
                {errors.termsAccept && (
                  <Text color="$red9" fontSize="$2">
                    {errors.termsAccept.message}
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

        <XStack justifyContent="center" gap="$2">
          <Link href="/(auth)/terms">
            <Text color="$colorMuted" fontSize="$2" textDecorationLine="underline">
              Terms of Use
            </Text>
          </Link>
          <Paragraph color="$colorMuted" fontSize="$2">
            ·
          </Paragraph>
          <Link href="/(auth)/privacy">
            <Text color="$colorMuted" fontSize="$2" textDecorationLine="underline">
              Privacy Policy
            </Text>
          </Link>
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}
