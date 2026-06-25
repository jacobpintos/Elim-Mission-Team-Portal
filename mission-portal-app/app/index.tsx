import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  if (loading) return null

  const isNonPublic = profile?.roles?.some((r) => r !== 'public') ?? false
  const isAuthenticated = fbUser && (fbUser.emailVerified || isNonPublic)

  if (isAuthenticated && profile) {
    const firstTab = visibleTabs(profile)[0] ?? 'home'
    return <Redirect href={`/(app)/${firstTab}` as never} />
  }

  return <Redirect href="/(auth)/login" />
}
