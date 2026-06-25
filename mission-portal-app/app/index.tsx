import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  // Authenticated but no Firestore document — route to onboarding to create profile.
  // This handles accounts created before the portal schema existed (no users doc).
  if (fbUser && !profile) return <Redirect href="/(onboarding)" />

  // Non-public roles (admin, worship, etc.) are created by admins and bypass email verification
  const isPublic = profile?.roles?.includes('public') ?? false
  const needsEmailVerify = fbUser && !fbUser.emailVerified && isPublic
  if (needsEmailVerify) return <Redirect href="/(auth)/verify-email" />

  const isNonPublic = profile?.roles?.some((r) => r !== 'public') ?? false
  const isAuthenticated = fbUser && (fbUser.emailVerified || isNonPublic)

  // Non-public users (admin, worship, etc.) skip onboarding — they're set up by admins.
  // Public users only enter the app after completing onboarding.
  if (isAuthenticated && profile && (profile.onboardingComplete || isNonPublic)) {
    const firstTab = visibleTabs(profile)[0] ?? 'home'
    return <Redirect href={`/(app)/${firstTab}` as never} />
  }

  if (isAuthenticated && profile && !profile.onboardingComplete)
    return <Redirect href="/(onboarding)" />

  return <Redirect href="/(auth)/login" />
}
