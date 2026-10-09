import { useEffect, useState, type ReactNode } from 'react'
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

  useEffect(() => {
    if (!host || !visible) return
    document.body.appendChild(host)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      host.remove()
    }
  }, [host, visible, onRequestClose])

  if (!host || !visible) return null
  return createPortal(<div style={{ pointerEvents: 'none', flex: 1 }}>{children}</div>, host)
}
