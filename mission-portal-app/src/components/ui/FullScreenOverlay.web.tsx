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
/** How long after a field gains or loses focus the layer keeps refitting. */
const SETTLE_MS = 900

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
  // brings up the iPhone's keyboard, and Safari moves the page to keep the
  // field in sight — taking a layer pinned to the top of the page with it,
  // while everything inside is sized (by react-native-web) to the space left
  // above the keyboard. The chord sheet's notes and the set list's fields went
  // most of the way off the top, and what showed beneath was the page behind.
  // So, open, the layer follows the visible area: where it is on the page and
  // how tall. Not while pinched into, where the visible area is the part
  // zoomed in on and the layer must stay the page's size to be zoomed at all.
  //
  // Safari moves the page in more than one way — the visible area within the
  // page, which the visual viewport reports, or the page itself, which only
  // the window's scroll does — and does not always say when it has finished.
  // So the layer is fitted on every one of those, and for most of a second
  // after a field gains or loses focus it is fitted every frame until the
  // keyboard has settled.
  useEffect(() => {
    if (!host || !rendered || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    // Shrunk to fit above the keyboard after Safari had already brought the
    // field into view, the layer can leave the field below its fold: bring it
    // back, within the layer's own scrolling, whenever the layer's size moves.
    let fitted = ''
    const fit = () => {
      fitToVisible(host, vv)
      const size = `${host.style.width}x${host.style.height}`
      if (size === fitted) return
      fitted = size
      const el = document.activeElement
      if (typing() && el instanceof HTMLElement && host.contains(el)) revealInside(host, el)
    }
    let until = 0
    let frame = 0
    const loop = () => {
      frame = 0
      fit()
      if (performance.now() < until) frame = requestAnimationFrame(loop)
    }
    const settle = () => {
      until = performance.now() + SETTLE_MS
      if (!frame) frame = requestAnimationFrame(loop)
    }
    fit()
    vv.addEventListener('resize', settle)
    vv.addEventListener('scroll', fit)
    window.addEventListener('scroll', fit, true)
    host.addEventListener('focusin', settle)
    host.addEventListener('focusout', settle)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv.removeEventListener('resize', settle)
      vv.removeEventListener('scroll', fit)
      window.removeEventListener('scroll', fit, true)
      host.removeEventListener('focusin', settle)
      host.removeEventListener('focusout', settle)
      fitToVisible(host, null)
      unscrollPage()
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
  // Keyboard gone, and the page left scrolled — which Safari does — though
  // nothing in this app ever scrolls the page: put it back, or the screen
  // behind stays shifted up after the layer has closed.
  // Never while a field has focus: opening, the keyboard may move the page
  // before the visible area has shrunk, and that is not to be undone.
  const keyboardUp = vv !== null && vv.height < document.documentElement.clientHeight - 1
  if (vv && !zoomed && !keyboardUp && !typing()) unscrollPage()
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

/** Whether a field has focus — so the keyboard is up, or on its way. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * Scroll the field into the part of the layer that can be seen — by the
 * scrolling box it sits in, and only that. scrollIntoView would scroll the
 * page as well, which is the very thing being kept still.
 */
function revealInside(host: HTMLElement, el: HTMLElement) {
  let box = el.parentElement
  while (box && box !== host) {
    const { overflowY } = getComputedStyle(box)
    if (/(auto|scroll)/.test(overflowY) && box.scrollHeight > box.clientHeight) break
    box = box.parentElement
  }
  if (!box || box === host) return
  const margin = 12
  const field = el.getBoundingClientRect()
  const seen = box.getBoundingClientRect()
  const layer = host.getBoundingClientRect()
  const top = Math.max(seen.top, layer.top) + margin
  const bottom = Math.min(seen.bottom, layer.bottom) - margin
  if (field.bottom > bottom) box.scrollTop += field.bottom - bottom
  else if (field.top < top) box.scrollTop -= top - field.top
}

/** This app's page never scrolls — its screens scroll inside themselves. */
function unscrollPage() {
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
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
