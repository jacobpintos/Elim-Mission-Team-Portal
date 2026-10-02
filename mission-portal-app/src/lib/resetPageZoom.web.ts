import { withZoomReset, withoutZoomReset } from '@/lib/viewportMeta'

/** Long enough for the browser to zoom out; short enough not to be noticed. */
const CAP_MS = 500
let lift: ReturnType<typeof setTimeout> | null = null

/**
 * Have the browser act on a changed viewport tag now.
 *
 * A browser reads the tag when it next lays the page out, and on a sheet
 * standing still nothing else asks it to: the cap went unapplied, or — once
 * the sheet's opening had applied it — was never lifted, and pinching did
 * nothing until something else on screen changed. So the tag is followed by
 * a change to the page's layout that no one can see: a one-point box, out of
 * the way and invisible, made a point taller or shorter. A style alone does
 * not do it; it has to move something.
 */
let nudge: HTMLDivElement | null = null
function applyNow(meta: Element, content: string) {
  meta.setAttribute('content', content)
  if (!nudge || !nudge.isConnected) {
    nudge = document.createElement('div')
    nudge.setAttribute('aria-hidden', 'true')
    nudge.style.cssText =
      'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(nudge)
  }
  nudge.style.height = nudge.style.height === '1px' ? '2px' : '1px'
}

/**
 * Zoom the page back out to 100% — the phone's own pinch zoom, not the
 * sheet's text size.
 *
 * A page cannot set its zoom, but it can cap it: the viewport tag is given
 * maximum-scale=1 for half a second, which the browser answers by zooming
 * out, and then the cap is lifted so pinching to zoom works as before.
 * Nothing is done when the page is not zoomed.
 */
export function resetPageZoom(): void {
  if (typeof document === 'undefined') return
  const scale = window.visualViewport?.scale
  if (scale !== undefined && Math.abs(scale - 1) < 0.01) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  applyNow(meta, withZoomReset(meta.getAttribute('content') ?? ''))
  if (lift) clearTimeout(lift)
  lift = setTimeout(() => {
    lift = null
    applyNow(meta, withoutZoomReset(meta.getAttribute('content') ?? ''))
  }, CAP_MS)
}
