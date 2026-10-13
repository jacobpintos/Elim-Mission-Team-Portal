import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'

/** A rectangle on screen, in the window's points. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DragCardProps {
  children: ReactNode
  enabled?: boolean
  /** A tap rather than a drag. */
  onTap?: () => void
  /** Picked up: where the card was, and where on it the finger is. */
  onDragStart: (card: Rect, grab: { x: number; y: number }) => void
  /** How far it has moved since it was picked up. */
  onDragMove: (moved: { x: number; y: number }) => void
  onDragEnd: (moved: { x: number; y: number }) => void
  onDragCancel: () => void
}

/**
 * How long a finger rests on a card before it lifts. Any shorter and a quick
 * swipe meant to scroll the list would pick a card up instead.
 */
export const HOLD_MS = 220

/** Where a view is on screen, in the same space as every other measured here. */
export function measureRect(view: View | null, done: (rect: Rect) => void) {
  view?.measureInWindow((x, y, width, height) => done({ x, y, width, height }))
}

/**
 * A card that can be held and dragged, or tapped (the phones' version — the
 * web has its own in DragCard.web.tsx).
 *
 * The card itself stays where it is; whoever uses it draws whatever follows
 * the finger, so all this reports is how far it has gone. That is measured
 * from where it was picked up rather than as a position on screen, so it
 * agrees with measureInWindow on every platform, inside a modal or not.
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
  const [lift] = useState(liftTracker)

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled)
    .activateAfterLongPress(HOLD_MS)
    .onStart((e) => {
      Haptics.selectionAsync().catch(() => {})
      lift.start({ x: e.x, y: e.y }, onDragStart, onDragMove)
    })
    .onUpdate((e) => lift.move({ x: e.translationX, y: e.translationY }, onDragMove))
    .onEnd((e, success) =>
      lift.end(success, { x: e.translationX, y: e.translationY }, onDragEnd, onDragCancel)
    )

  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(enabled && !!onTap)
    .onEnd((_e, success) => {
      if (success) onTap?.()
    })

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View ref={(v) => lift.setView(v)} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  )
}

/**
 * One card's lift, from the moment it is picked up to where it is let go.
 *
 * The card is measured as it lifts, and that answer comes back on its own
 * time: movement before then is kept, and passed on once it has.
 */
function liftTracker() {
  let view: View | null = null
  let measured = false
  let last: { x: number; y: number } | null = null
  // Which lift this is, so an answer that comes back after the card was let
  // go — or after the next one was picked up — starts nothing.
  let lift = 0
  return {
    setView: (v: View | null) => {
      view = v
    },
    start(
      grab: { x: number; y: number },
      onStart: DragCardProps['onDragStart'],
      onMove: DragCardProps['onDragMove']
    ) {
      const mine = ++lift
      measured = false
      last = null
      measureRect(view, (rect) => {
        if (mine !== lift) return
        measured = true
        onStart(rect, grab)
        if (last) onMove(last)
      })
    },
    move(moved: { x: number; y: number }, onMove: DragCardProps['onDragMove']) {
      last = moved
      if (measured) onMove(moved)
    },
    end(
      success: boolean,
      moved: { x: number; y: number },
      onEnd: DragCardProps['onDragEnd'],
      onCancel: DragCardProps['onDragCancel']
    ) {
      if (success && measured) onEnd(moved)
      else onCancel()
      lift++
      measured = false
      last = null
    },
  }
}
