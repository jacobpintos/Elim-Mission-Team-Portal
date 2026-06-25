import { useEffect, useMemo, useRef } from 'react'
import { Platform, Text } from 'react-native'
import { Slot, useRouter, useSegments, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router'
import { visibleTabs } from '@/lib/roles'
import '@tamagui/core/reset.css'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react-native'
import * as Notifications from 'expo-notifications'
import { DynamicThemeProvider } from '@/theme/DynamicThemeProvider'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
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
    const seg = segments as string[]
    const inAuth = seg[0] === '(auth)'
    const inOnboarding = seg[0] === '(onboarding)'
    const atRoot = !seg[0]

    if (!fbUser && !inAuth && !atRoot) {
      router.replace('/')
    } else if (fbUser && !fbUser.emailVerified && !inAuth && profile?.roles?.includes('public')) {
      router.replace('/(auth)/verify-email')
    } else if (fbUser && (fbUser.emailVerified || (profile && !profile?.roles?.includes('public'))) && inAuth) {
      // Navigate directly to avoid competing with index.tsx's <Redirect>
      if (profile && !profile.onboardingComplete) {
        router.replace('/(onboarding)')
      } else if (profile?.onboardingComplete) {
        const firstTab = visibleTabs(profile)[0] ?? 'home'
        router.replace(`/(app)/${firstTab}` as never)
      }
      // profile=null + emailVerified=true: no-op, user stays at auth route
    } else if (
      fbUser &&
      (fbUser.emailVerified || !profile?.roles?.includes('public')) &&
      profile &&
      !profile.onboardingComplete &&
      !inOnboarding
    ) {
      router.replace('/(onboarding)')
    } else if (fbUser && fbUser.emailVerified && profile?.onboardingComplete && inOnboarding) {
      const firstTab = visibleTabs(profile)[0] ?? 'home'
      router.replace(`/(app)/${firstTab}` as never)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser, profile, loading, segments])

  return <>{children}</>
}

export default function RootLayout() {
  const init = useAuthStore((s) => s.init)
  const teardown = useAuthStore((s) => s.teardown)
  const router = useRouter()
  const theme = useThemeStore((s) => s.theme)
  const mode = useThemeStore((s) => s.mode)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const { logoUrl } = theme
    if (!logoUrl) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = logoUrl
  }, [theme.logoUrl])
  const notifListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  // React Navigation's <Screen> wraps every route in a <Background> that paints
  // `colors.background` from the active navigation theme. The default is gray
  // (rgb(242,242,242)), which shows through our transparent screens. Override
  // the navigation theme so that Background paints the real palette colour.
  const navTheme = useMemo(() => {
    const palette = mode === 'dark' ? theme.dark : theme.light
    const base = mode === 'dark' ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.primary,
        background: palette.background,
        card: palette.surface,
        text: palette.text,
        border: palette.border,
      },
    }
  }, [theme, mode])

  useEffect(() => {
    init()
    return () => teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              <ThemeProvider value={navTheme}>
                <AuthGate>
                  <Slot />
                </AuthGate>
                <ToastContainer />
              </ThemeProvider>
            </DynamicThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
}

function ErrorFallback() {
  return (
    <GestureHandlerRootView
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
        Something went wrong
      </Text>
      <Text style={{ color: '#666', textAlign: 'center' }}>
        Please reload the page to try again.
      </Text>
    </GestureHandlerRootView>
  )
}
