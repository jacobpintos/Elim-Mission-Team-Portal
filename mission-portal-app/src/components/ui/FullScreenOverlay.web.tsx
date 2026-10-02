import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { View, type ModalProps } from 'react-native'

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
 * viewport, which fits: this is not something the layout does. Moving the
 * chord sheet onto this fixed it on the phone that reported it.
 *
 * Absolute positioning has none of that. The app's body is exactly the
 * viewport and cannot scroll, so top/left/right/bottom of zero covers the
 * screen the same way — as an ordinary element the browser has no reason to
 * treat specially.
 *
 * Takes the Modal props this app uses — visible, animationType, transparent,
 * onRequestClose — so it drops in where a Modal was. The rest are native-only
 * and have no meaning here.
 */

/** Open overlays, oldest first, so Escape closes only the one on top. */
const openStack: number[] = []
let nextId = 0

const DURATION = 300

/** The Web Animations API, which every browser this app supports has. */
const CAN_ANIMATE =
  typeof document !== 'undefined' && typeof document.createElement('div').animate === 'function'

export function FullScreenOverlay({
  visible = true,
  animationType = 'none',
  transparent = false,
  onRequestClose,
  children,
}: ModalProps) {
  // Still on screen while the exit animation runs, then gone. With nothing to
  // animate it simply follows visible, decided here rather than in an effect.
  const [rendered, setRendered] = useState(visible)
  if (visible && !rendered) setRendered(true)
  if (!visible && rendered && !(CAN_ANIMATE && keyframes(animationType))) setRendered(false)

  // Built once and kept, so the portal target is stable for the component's
  // life — but only put in the document while there is something to show.
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null
    const el = document.createElement('div')
    el.style.cssText =
      'position:absolute;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    return el
  })
  const [id] = useState(() => nextId++)

  // Appended when it opens rather than when it mounts. react-native-web's
  // Modal appends its container on first render whether or not it is visible,
  // so two modals stacked in the order their components mounted, not the
  // order they opened — which is how a video once opened behind the set list
  // it was started from. Appending on open puts the newest on top every time.
  const wasVisible = useRef(false)
  useEffect(() => {
    if (!host || !rendered) return
    setStyle(host, 'background', transparent ? 'transparent' : 'white')
    document.body.appendChild(host)
    openStack.push(id)
    return () => {
      const at = openStack.indexOf(id)
      if (at !== -1) openStack.splice(at, 1)
      host.remove()
      // So the next open plays its entrance again.
      wasVisible.current = false
    }
  }, [host, rendered, id, transparent])

  // Enter and exit. Played with the Web Animations API and no fill, so the
  // transform a slide uses is gone the moment it finishes rather than left on
  // the layer for as long as it is open.
  useEffect(() => {
    if (!host || !rendered) return
    const frames = keyframes(animationType)
    if (visible && !wasVisible.current) {
      wasVisible.current = true
      play(host, frames, 'ease-in')
      return
    }
    if (!visible && wasVisible.current) {
      wasVisible.current = false
      // Only reached with something to animate; the render above handles the
      // rest. Nothing under the finger while it leaves, as react-native-web
      // does.
      const out = play(host, frames ? [...frames].reverse() : null, 'ease-out')
      if (!out) return
      setStyle(host, 'pointerEvents', 'none')
      let cancelled = false
      out.finished
        .catch(() => {})
        .then(() => {
          if (cancelled) return
          setStyle(host, 'pointerEvents', '')
          setRendered(false)
        })
      return () => {
        // Reopened before it finished leaving: stop, and take touches again.
        cancelled = true
        out.cancel()
        setStyle(host, 'pointerEvents', '')
      }
    }
  }, [host, rendered, visible, animationType])

  // Over what is on screen, keyboard or no keyboard. Typing into a field here
  // brings up the iPhone's keyboard, and Safari scrolls the page up to keep
  // the field in sight — taking a layer pinned to the top of the page with it,
  // while everything inside is sized (by react-native-web) to the space left
  // above the keyboard. The chord sheet's notes went most of the way off the
  // top, and what showed beneath was the page behind the sheet. So, open, the
  // layer follows the visible area: where it is on the page and how tall.
  // Not while pinched into, where the visible area is the part zoomed in on
  // and the layer must stay the page's size to be zoomed at all.
  useEffect(() => {
    if (!host || !rendered || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const fit = () => fitToVisible(host, vv)
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
      fitToVisible(host, null)
    }
  }, [host, rendered])

  useEffect(() => {
    if (!rendered || typeof document === 'undefined') return
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openStack[openStack.length - 1] !== id) return
      e.stopPropagation()
      // Typed to receive a native event on the platforms that have one; every
      // caller here ignores it.
      ;(onRequestClose as (() => void) | undefined)?.()
    }
    document.addEventListener('keyup', onKeyUp)
    return () => document.removeEventListener('keyup', onKeyUp)
  }, [rendered, id, onRequestClose])

  if (!host || !rendered) return null
  // A View between the host and the content, as react-native-web's Modal has,
  // so a child that says flex: 1 fills the screen the way it did before.
  return createPortal(<View style={{ flex: 1 }}>{children}</View>, host)
}

/** DOM writes kept out of the component, where the host is just a value. */
function setStyle(el: HTMLElement, prop: 'background' | 'pointerEvents', value: string) {
  el.style[prop] = value
}

/**
 * Put the layer over the visible area — pageTop/pageLeft are where it is on
 * the page, which the layer is positioned against — or, given nothing or
 * while zoomed, back to covering the page.
 */
function fitToVisible(el: HTMLElement, vv: VisualViewport | null) {
  const zoomed = vv !== null && Math.abs(vv.scale - 1) > 0.01
  if (!vv || zoomed) {
    Object.assign(el.style, { top: '0', left: '0', right: '0', bottom: '0', width: '', height: '' })
    return
  }
  Object.assign(el.style, {
    top: `${vv.pageTop}px`,
    left: `${vv.pageLeft}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${vv.width}px`,
    height: `${vv.height}px`,
  })
}

function play(el: HTMLElement, frames: Keyframe[] | null, easing: string): Animation | null {
  if (!frames || typeof el.animate !== 'function') return null
  return el.animate(frames, { duration: DURATION, easing })
}

function keyframes(type: ModalProps['animationType']): Keyframe[] | null {
  if (type === 'slide') return [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]
  if (type === 'fade') return [{ opacity: 0 }, { opacity: 1 }]
  return null
}
