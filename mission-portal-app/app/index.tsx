import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'
import { takePendingNotificationLink } from '@/lib/notificationLink'

export default function Index() {
  const { fbUser, profile, loading } = useAuthStore()

  const isNonPublic = profile?.roles?.some((r) => r !== 'public') ?? false
  const signedIn = !loading && !!profile && !!fbUser && (fbUser.emailVerified || isNonPublic)

  // Where a signed-in person lands: the screen a tapped notification names,
  // when tapping it is what opened the app — else their first tab.
  //
  // This is the cold start of someone already signed in, which never passes
  // through the sign-in screens where AuthGate asks the same question. Left
  // to their first tab, the notification's own screen was pushed a moment
  // later by NotificationRouter (app/_layout), while the tabs were still being
  // set up — and on a phone that push could be lost, leaving them on Home
  // instead of the meeting request they tapped. Deciding it here means there
  // is only ever one navigation.
  //
  // Taken in an effect, once: taking it clears it, which NotificationRouter
  // hears, so it doesn't go there a second time.
  const [landing, setLanding] = useState<string | null>(null)
  useEffect(() => {
    if (!signedIn || landing) return
    const firstTab = visibleTabs(profile)[0] ?? 'home'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanding(takePendingNotificationLink() ?? `/(app)/${firstTab}`)
  }, [signedIn, landing, profile])

  if (loading) return null
  if (signedIn) return landing ? <Redirect href={landing as never} /> : null
  return <Redirect href="/(auth)/login" />
}
