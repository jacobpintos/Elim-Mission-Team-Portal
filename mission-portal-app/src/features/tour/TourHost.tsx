import { useEffect, useMemo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import { useTourStore } from './tourStore'
import { TourOverlay } from './TourOverlay'
import { buildFullTour, buildTabTour } from './flows'
import { hasSeenTour, setTourSeen } from './persist'

/**
 * Mounts the tour overlay, auto-launches the first-login tour, drives screen
 * navigation as steps advance, and renders the per-screen "Need help?" button.
 * Purely additive — it reads stores but never writes app data.
 */
export function TourHost() {
  const { profile } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const c = useThemeColors()

  const active = useTourStore((s) => s.active)
  const steps = useTourStore((s) => s.steps)
  const index = useTourStore((s) => s.index)
  const start = useTourStore((s) => s.start)

  const launchedRef = useRef(false)

  // Auto-launch the full tour once, the first time this user reaches the app.
  useEffect(() => {
    const uid = profile?.uid
    if (!uid || launchedRef.current) return
    if (visibleTabs(profile).length === 0) return
    let cancelled = false
    hasSeenTour(uid).then((seen) => {
      if (cancelled || seen || launchedRef.current) return
      if (useTourStore.getState().active) return
      launchedRef.current = true
      // Mark as seen immediately so a refresh mid-tour doesn't relaunch it.
      setTourSeen(uid)
      start({ title: 'Mission Portal', steps: buildFullTour(profile) })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid])

  // As steps advance, navigate the real app to the step's screen.
  useEffect(() => {
    if (!active) return
    const route = steps[index]?.route
    if (route && pathname !== route) router.push(route as Parameters<typeof router.push>[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  const seg = pathname.split('/').filter(Boolean)[0] ?? ''
  const tabTour = useMemo(() => buildTabTour(seg, profile), [seg, profile])

  return (
    <>
      {/* "Need help?" launcher for the current screen — hidden while a tour is running. */}
      {!active && tabTour ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', right: 16, bottom: insets.bottom + 16, zIndex: 5 }}
        >
          <Pressable
            onPress={() => start({ title: tabTour.title, steps: tabTour.steps })}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: c.primary,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <Text color={c.onPrimary} fontSize={14} fontWeight="800">
              ?
            </Text>
            <Text color={c.onPrimary} fontSize={13} fontWeight="700">
              Need help?
            </Text>
          </Pressable>
        </View>
      ) : null}

      <TourOverlay />
    </>
  )
}
