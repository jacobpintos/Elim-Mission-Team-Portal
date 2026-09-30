import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A full-screen layer over the app — absolutely positioned, not fixed.
 *
 * react-native-web builds a Modal out of a position: fixed box covering the
 * viewport, and on iOS in landscape that box is where taps stopped matching
 * what was on screen: every control in the chord sheet answered a tap about
 * fifty points below itself, so pressing a button did nothing, pressing the
 * row beneath it fired the row above, and pressing empty space under the last
 * row fired the last row.
 *
 * A fixed element is positioned against the layout viewport, which in landscape
 * Safari is not the rectangle you are looking at — the browser's own chrome
 * overlays the page, and fixed elements are shifted down so they stay visible
 * while their boxes, which is what a touch is resolved against, are not. Paint
 * and hit testing end up in two different coordinate spaces, and everything
 * inside is off by the same amount. It never reproduced in Chromium at any
 * viewport, which fits: this is not something the layout does.
 *
 * Absolute positioning has none of that. The app's body is exactly the
 * viewport and cannot scroll, so top/left/right/bottom of zero covers the
 * screen the same way — as an ordinary element the browser has no reason to
 * treat specially.
 *
 * Appended to <body> rather than inside the app root on purpose: it keeps the
 * paint order react-native-web's own modals have, so an overlay opened over
 * another one still lands on top.
 */
export function FullScreenOverlay({
  children,
  onRequestClose,
}: {
  children: ReactNode
  onRequestClose: () => void
}) {
  // Built once, on the first render, and kept for the life of the overlay.
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:9999'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    return el
  })

  useEffect(() => {
    if (!host || typeof document === 'undefined') return
    document.body.appendChild(host)
    return () => {
      host.remove()
    }
  }, [host])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose()
    }
    document.addEventListener('keyup', onKeyUp)
    return () => document.removeEventListener('keyup', onKeyUp)
  }, [onRequestClose])

  return host ? createPortal(children, host) : null
}
