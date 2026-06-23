import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { visibleTabs } from '@/lib/roles'
import { useTourStore } from './tourStore'
import { TourOverlay } from './TourOverlay'
import { buildFullTour } from './flows'
import { hasSeenTour, setTourSeen } from './persist'

/**
 * Mounts the tour overlay, auto-launches the first-login tour, and drives screen
 * navigation as steps advance. The "Need help?" entry lives in the app drawer.
 * Purely additive — it reads stores but never writes app data.
 */
export function TourHost() {
  const { profile } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()

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

  return <TourOverlay />
}
