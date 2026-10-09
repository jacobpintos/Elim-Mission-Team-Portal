import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A layer above everything — a chord sheet open in its own overlay included —
 * that covers nothing it does not draw: no backdrop, nothing dimmed, and
 * every touch outside what it draws goes through to the page beneath.
 *
 * Absolutely positioned, like FullScreenOverlay.web.tsx and for the same
 * reason (a fixed layer's touches drift from what is drawn on an iPhone held
 * sideways), and put in the document when shown, so it is above whatever
 * opened before it.
 */
export function FloatingLayer({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean
  onRequestClose: () => void
  children: ReactNode
}) {
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null
    const el = document.createElement('div')
    el.style.cssText =
      'position:absolute;top:0;left:0;right:0;bottom:0;z-index:10000;display:flex;flex-direction:column;pointer-events:none'
    return el
  })

  // The latest, without putting the layer back in the document each time a
  // new one is passed — which would take the focus from a field being typed in.
  const closeRef = useRef(onRequestClose)
  useEffect(() => {
    closeRef.current = onRequestClose
  })

  useEffect(() => {
    if (!host || !visible) return
    document.body.appendChild(host)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      host.remove()
    }
  }, [host, visible])

  if (!host || !visible) return null
  return createPortal(<div style={{ pointerEvents: 'none', flex: 1 }}>{children}</div>, host)
}
