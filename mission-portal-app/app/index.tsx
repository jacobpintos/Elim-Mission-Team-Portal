import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

export default function Index() {
  const { profile, loading } = useAuthStore()
  if (loading) return null
  if (!profile) return <Redirect href="/(auth)/login" />
  if (!profile.onboardingComplete) return <Redirect href="/(onboarding)" />
  return <Redirect href="/(app)/home" />
}
