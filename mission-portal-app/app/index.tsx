import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  // Non-public roles (admin, worship, etc.) are created by admins and bypass email verification
  const isPublic = !profile || profile.roles.includes('public')
  const needsEmailVerify = fbUser && !fbUser.emailVerified && isPublic
  if (needsEmailVerify) return <Redirect href="/(auth)/verify-email" />

  const isAuthenticated = fbUser && (fbUser.emailVerified || (profile && !isPublic))

  if (isAuthenticated && profile && !profile.onboardingComplete)
    return <Redirect href="/(onboarding)" />

  if (isAuthenticated && profile?.onboardingComplete)
    return <Redirect href="/(app)/home" />

  return <Redirect href="/(auth)/login" />
}
