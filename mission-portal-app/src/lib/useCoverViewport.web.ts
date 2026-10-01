import { useEffect } from 'react'
import { withViewportFitCover } from '@/lib/viewportMeta'

/**
 * Let the page reach the edges of the screen while `active`, and put it back
 * when it is not.
 *
 * A home-screen web app on an iPhone held sideways is drawn inside a box that
 * stops short of the notch — 59 points off the top and both sides of an
 * iPhone 15 Pro — unless the viewport tag asks for the whole screen with
 * viewport-fit=cover. Asking for it globally would put every screen's header
 * and tab bar under the notch and the home bar, so it is asked for only while
 * something that wants the whole screen is open, and the tag the app shipped
 * with is restored the moment it closes.
 *
 * Whatever is shown while this is on has to keep its own content clear of
 * the notch and the home bar — env(safe-area-inset-*) reports them once the
 * page covers the screen, and reads 0 when it does not, so padding by it is
 * safe either way.
 */
export function useCoverViewport(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const original = meta.getAttribute('content') ?? ''
    const covered = withViewportFitCover(original)
    if (covered === original) return
    meta.setAttribute('content', covered)
    return () => {
      meta.setAttribute('content', original)
    }
  }, [active])
}
