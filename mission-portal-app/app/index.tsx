import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()
  if (loading) return null
  if (!fbUser) return <Redirect href="/(public)" />
  if (!profile) return <Redirect href="/(public)" />
  if (!profile.onboardingComplete) return <Redirect href="/(onboarding)" />
  return <Redirect href="/(app)/home" />
}
