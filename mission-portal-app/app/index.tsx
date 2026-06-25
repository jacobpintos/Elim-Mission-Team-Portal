import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  // Non-public roles (admin, worship, etc.) are created by admins and bypass email verification
  const isPublic = profile?.roles?.includes('public') ?? false
  const needsEmailVerify = fbUser && !fbUser.emailVerified && isPublic
  if (needsEmailVerify) return <Redirect href="/(auth)/verify-email" />

  const isNonPublic = profile?.roles?.some((r) => r !== 'public') ?? false
  const isAuthenticated = fbUser && (fbUser.emailVerified || isNonPublic)

  if (isAuthenticated && profile) {
    const firstTab = visibleTabs(profile)[0] ?? 'home'
    return <Redirect href={`/(app)/${firstTab}` as never} />
  }

  return <Redirect href="/(auth)/login" />
}
