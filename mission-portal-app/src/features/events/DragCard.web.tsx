import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import type { DragCardProps, Rect } from './DragCard'

export type { DragCardProps, Rect } from './DragCard'

/** How long a finger rests on a card before it lifts (see DragCard.tsx). */
export const HOLD_MS = 220

/** How far a mouse moves with the button down before it is a drag rather than a click. */
const MOUSE_SLOP = 4
/** How far a finger may wander while being held before it counts as scrolling instead. */
const TOUCH_SLOP = 8

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/** Where a view is on screen, in the viewport's pixels — what getBoundingClientRect gives. */
export function measureRect(view: View | null, done: (rect: Rect) => void) {
  const el = view as unknown as Element | null
  if (el && typeof el.getBoundingClientRect === 'function') done(rectOf(el))
}

/**
 * A card that can be dragged, or tapped — the web's version of DragCard.tsx.
 *
 * Written against the DOM rather than with react-native-gesture-handler,
 * because a touchscreen needs something it can't give. Its web drag sets
 * `touch-action: none` on the card, and then a swipe that lands on a card
 * scrolls nothing — in a list that is nearly all cards, the list can't be
 * scrolled at all. Anything gentler hands the swipe to the browser, which
 * then cancels the drag the moment the finger moves up or down.
 *
 * So a mouse drags straight away, and a finger has to rest on a card first,
 * as on the phones: moving before then is a scroll, left to the browser, and
 * once the card has lifted every move is kept from it. A non-passive
 * touchmove that calls preventDefault before any scrolling has begun is the
 * one way to do that which every mobile browser honours.
 */
export function DragCard({
  children,
  enabled = true,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: DragCardProps) {
  const ref = useRef<View>(null)
  // The latest callbacks, so the listeners below are attached once.
  const handlers = useRef({ onTap, onDragStart, onDragMove, onDragEnd, onDragCancel })
  useEffect(() => {
    handlers.current = { onTap, onDragStart, onDragMove, onDragEnd, onDragCancel }
  })

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null
    if (!el || !enabled) return
    const h = () => handlers.current

    // No text selection, and no iOS callout, while a card is held.
    el.style.userSelect = 'none'
    el.style.setProperty('-webkit-user-select', 'none')
    el.style.setProperty('-webkit-touch-callout', 'none')
    el.style.cursor = 'grab'

    let hold: {
      startX: number
      startY: number
      lastX: number
      lastY: number
      dragging: boolean
      timer: ReturnType<typeof setTimeout> | null
    } | null = null

    const lift = (x: number, y: number) => {
      if (!hold) return
      hold.dragging = true
      const card = rectOf(el)
      h().onDragStart(card, { x: x - card.x, y: y - card.y })
      if (typeof navigator !== 'undefined') navigator.vibrate?.(10)
    }
    const moved = () => (hold ? { x: hold.lastX - hold.startX, y: hold.lastY - hold.startY } : null)
    const clear = () => {
      if (hold?.timer) clearTimeout(hold.timer)
      hold = null
    }

    // ── Touch ───────────────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (hold?.dragging) h().onDragCancel()
        clear()
        return
      }
      const t = e.touches[0]
      clear()
      hold = {
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastY: t.clientY,
        dragging: false,
        timer: setTimeout(() => {
          if (hold) {
            hold.timer = null
            lift(hold.startX, hold.startY)
          }
        }, HOLD_MS),
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!hold) return
      const t = e.touches[0]
      if (!t) return
      hold.lastX = t.clientX
      hold.lastY = t.clientY
      if (hold.dragging) {
        // Ours now: the page must not scroll under it.
        if (e.cancelable) e.preventDefault()
        const m = moved()
        if (m) h().onDragMove(m)
        return
      }
      // Moved before it lifted: a scroll, which is the browser's.
      if (Math.hypot(t.clientX - hold.startX, t.clientY - hold.startY) > TOUCH_SLOP) clear()
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!hold) return
      const wasDragging = hold.dragging
      const m = moved()
      clear()
      // No mouse events or click after it: they would be taken as a second tap.
      if (e.cancelable) e.preventDefault()
      if (wasDragging && m) h().onDragEnd(m)
      else h().onTap?.()
    }
    const onTouchCancel = () => {
      if (hold?.dragging) h().onDragCancel()
      clear()
    }
    // A long press opens the context menu on Android, and selects on iOS.
    const onContextMenu = (e: Event) => {
      if (hold) e.preventDefault()
    }

    // ── Mouse (and pen) ─────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      clear()
      hold = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dragging: false,
        timer: null,
      }
      el.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !hold) return
      hold.lastX = e.clientX
      hold.lastY = e.clientY
      if (!hold.dragging) {
        if (Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) <= MOUSE_SLOP) return
        lift(hold.startX, hold.startY)
        el.style.cursor = 'grabbing'
      }
      e.preventDefault()
      const m = moved()
      if (m) h().onDragMove(m)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !hold) return
      const wasDragging = hold.dragging
      const m = moved()
      clear()
      el.style.cursor = 'grab'
      el.releasePointerCapture?.(e.pointerId)
      if (wasDragging && m) h().onDragEnd(m)
      else h().onTap?.()
    }
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !hold) return
      if (hold.dragging) h().onDragCancel()
      clear()
      el.style.cursor = 'grab'
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', onTouchCancel)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    return () => {
      if (hold?.dragging) h().onDragCancel()
      clear()
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.style.cursor = ''
    }
  }, [enabled])

  return <View ref={ref}>{children}</View>
}
