import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  if (fbUser && !fbUser.emailVerified) return <Redirect href="/(auth)/verify-email" />

  if (fbUser && fbUser.emailVerified && profile && !profile.onboardingComplete)
    return <Redirect href="/(onboarding)" />

  if (fbUser && fbUser.emailVerified && profile?.onboardingComplete)
    return <Redirect href="/(app)/home" />

  return <Redirect href="/(auth)/login" />
}
