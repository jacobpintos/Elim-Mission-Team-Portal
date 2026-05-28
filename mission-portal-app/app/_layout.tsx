import { useEffect, useRef } from 'react'
import { Platform, Text } from 'react-native'
import { Slot, useRouter, useSegments } from 'expo-router'
import '@tamagui/core/reset.css'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react-native'
import * as Notifications from 'expo-notifications'
import { DynamicThemeProvider } from '@/theme/DynamicThemeProvider'
import { useAuthStore } from '@/stores/authStore'
import { ToastContainer } from '@/components/ui/Toast'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: __DEV__,
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function AuthGate({ children }: { children: React.ReactNode }) {
  const segments = useSegments()
  const router = useRouter()
  const { fbUser, profile, loading } = useAuthStore()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    const inOnboarding = segments[0] === '(onboarding)'
    const inPublic = segments[0] === '(public)'

    if (!fbUser && !inAuth && !inPublic) {
      router.replace('/(public)')
    } else if (fbUser && !fbUser.emailVerified && !inAuth) {
      router.replace('/(auth)/verify-email')
    } else if (fbUser && fbUser.emailVerified && (inAuth || inPublic)) {
      router.replace('/')
    } else if (
      fbUser &&
      fbUser.emailVerified &&
      profile &&
      !profile.onboardingComplete &&
      !inOnboarding
    ) {
      router.replace('/(onboarding)')
    } else if (fbUser && fbUser.emailVerified && profile?.onboardingComplete && inOnboarding) {
      router.replace('/')
    }
  }, [fbUser, profile, loading, segments, router])

  return <>{children}</>
}

export default function RootLayout() {
  const init = useAuthStore((s) => s.init)
  const teardown = useAuthStore((s) => s.teardown)
  const router = useRouter()
  const notifListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  useEffect(() => {
    if (Platform.OS === 'web') return
    notifListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification)
    })

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; link?: string }
      if (data.link) {
        router.push(data.link as Parameters<typeof router.push>[0])
      }
    })

    return () => {
      notifListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [router])

  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <DynamicThemeProvider>
              <AuthGate>
                <Slot />
              </AuthGate>
              <ToastContainer />
            </DynamicThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
}

function ErrorFallback() {
  return (
    <GestureHandlerRootView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: '#666', textAlign: 'center' }}>Please reload the page to try again.</Text>
    </GestureHandlerRootView>
  )
}
