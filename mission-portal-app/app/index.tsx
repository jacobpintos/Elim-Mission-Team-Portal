import { Image } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { YStack, H1, Paragraph, Button } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'

export default function Index() {
  const router = useRouter()
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  // Email unverified → verify screen
  if (fbUser && !fbUser.emailVerified) return <Redirect href="/(auth)/verify-email" />

  // Verified + no onboarding → onboarding
  if (fbUser && fbUser.emailVerified && profile && !profile.onboardingComplete)
    return <Redirect href="/(onboarding)" />

  // Fully authenticated → app
  if (fbUser && fbUser.emailVerified && profile?.onboardingComplete)
    return <Redirect href="/(app)/home" />

  // Unauthenticated → landing page (rendered directly, no redirect)
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" alignItems="center" justifyContent="center" gap="$8">
        <Image
          source={require('../assets/icon.png')}
          style={{ width: 120, height: 120, borderRadius: 20 }}
        />

        <YStack alignItems="center" gap="$3">
          <H1 textAlign="center">Elim Mission Church</H1>
          <Paragraph color="$colorMuted" textAlign="center" fontSize="$5">
            Welcome to the Mission Team Portal — your hub for team coordination, schedules, and
            communication.
          </Paragraph>
        </YStack>

        <YStack width="100%" gap="$3">
          <Button
            theme="active"
            backgroundColor="$primary"
            size="$5"
            onPress={() => router.push('/(auth)/login')}
          >
            Portal Login
          </Button>
          <Button variant="outlined" size="$5" onPress={() => router.push('/(auth)/register')}>
            Create Account
          </Button>
        </YStack>
      </YStack>
    </SafeAreaView>
  )
}
