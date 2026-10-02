import { useEffect, useRef, useState, type RefObject } from 'react'
import type {
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import {
  advance,
  clampLevel,
  isTap,
  parseSpeeds,
  speedFor,
  withSpeed,
  type SavedSpeeds,
} from '@/lib/autoScroll'

/**
 * Autoscroll for the chord sheet: hands-free, at a speed set per song, and
 * paused with a tap anywhere on the sheet.
 *
 * - The sheet moves a fraction of a point a frame, kept as a running total
 *   here rather than read back from the scroll view: a browser rounds its
 *   scroll position, and at the slow speeds the rounding would swallow every
 *   step and the sheet would never move.
 * - Anything else that moves the sheet — a drag, its momentum, a jump to the
 *   bridge, a mouse wheel — is noticed as a position this did not write. The
 *   sheet is left to it until it settles, and carries on from there: drag back
 *   a line to repeat it without stopping.
 * - It stops at the end of the sheet, and when the sheet is closed or another
 *   opened.
 * - The screen is kept awake while it runs or is paused, so the phone does not
 *   lock mid-song; it may sleep again once it has stopped.
 * - Each song remembers its speed on this device (a slow hymn and a fast
 *   opener are not played at one speed), and a song not yet played starts at
 *   the last speed used.
 */

export type AutoScrollState = 'off' | 'running' | 'paused'

const SPEEDS_KEY = 'chordsheet_scroll_speeds'
const AWAKE_TAG = 'chord-sheet-autoscroll'
/** How long the sheet is left to a hand, or a jump, after it last moved it. */
const SETTLE_MS = 180
/**
 * How long it stays still after a finger lifts from anywhere on the viewer.
 *
 * iPhone Safari makes a tap into a click — which is what presses a button on
 * the web — only if nothing scrolled while the finger was down and for a
 * moment after. Moving every frame, autoscroll spoiled every tap: the jump
 * bar, Size, the key, all dead until it was paused. Desktop browsers have no
 * such rule, so it never showed there.
 */
const AFTER_TOUCH_MS = 400

let cachedSpeeds: SavedSpeeds | null = null
function rememberSpeeds(saved: SavedSpeeds) {
  cachedSpeeds = saved
  AsyncStorage.setItem(SPEEDS_KEY, JSON.stringify(saved)).catch(() => {})
}

export function useAutoScroll(
  scrollRef: RefObject<ScrollView | null>,
  sheetId: string | null,
  textScale: number
) {
  const [state, setState] = useState<AutoScrollState>('off')
  const [level, setLevel] = useState(() =>
    cachedSpeeds && sheetId ? speedFor(cachedSpeeds, sheetId) : clampLevel(NaN)
  )

  // Read by the frame loop, which outlives any one render.
  const live = useRef({
    state: 'off' as AutoScrollState,
    level,
    textScale,
    y: 0, // where the sheet should be, unrounded
    written: 0, // where this last put it
    lastFrame: 0,
    movedByOther: 0, // when something else last moved it
    touching: false,
    fingerDown: false, // anywhere on the viewer
    stillUntil: 0, // and still until this long after it lifts
    touchStart: { x: 0, y: 0, t: 0, moved: 0 },
    viewHeight: 0,
    contentHeight: 0,
    frame: 0 as number | ReturnType<typeof setTimeout>,
  })
  useEffect(() => {
    live.current.level = level
    live.current.textScale = textScale
  }, [level, textScale])

  // A new sheet starts still, at its own speed. Set while rendering, as React
  // has it for state that follows a prop; the loop is stopped below.
  const [forSheet, setForSheet] = useState(sheetId)
  if (forSheet !== sheetId) {
    setForSheet(sheetId)
    setState('off')
    if (cachedSpeeds && sheetId) setLevel(speedFor(cachedSpeeds, sheetId))
  }

  // The saved speeds, read once a session.
  useEffect(() => {
    if (!sheetId || cachedSpeeds) return
    let cancelled = false
    AsyncStorage.getItem(SPEEDS_KEY)
      .then((raw) => {
        cachedSpeeds = parseSpeeds(raw)
        if (!cancelled) setLevel(speedFor(cachedSpeeds, sheetId))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sheetId])

  const end = () => live.current.contentHeight - live.current.viewHeight

  const write = (y: number) => {
    live.current.y = y
    live.current.written = y
    scrollRef.current?.scrollTo({ y, animated: false })
  }

  const stopLoop = () => {
    const l = live.current
    if (typeof l.frame === 'number' && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(l.frame)
    } else clearTimeout(l.frame as ReturnType<typeof setTimeout>)
    l.frame = 0
  }

  const go = (next: AutoScrollState) => {
    live.current.state = next
    setState(next)
  }

  const tick = (now: number) => {
    const l = live.current
    if (l.state !== 'running') return
    const seconds = l.lastFrame ? (now - l.lastFrame) / 1000 : 0
    l.lastFrame = now
    // Left to a hand, or a jump, until it settles.
    const fingerOn = l.fingerDown || now < l.stillUntil
    if (!l.touching && !fingerOn && now - l.movedByOther > SETTLE_MS) {
      const step = advance(l.y, l.level, l.textScale, seconds, end())
      write(step.y)
      if (step.done) {
        go('off')
        return
      }
    }
    l.frame = requestAnimationFrame(tick)
  }

  const run = () => {
    stopLoop()
    live.current.lastFrame = 0
    go('running')
    live.current.frame = requestAnimationFrame(tick)
  }

  const start = () => {
    // From the top again, if it had reached the end.
    if (live.current.y >= end() - 2) write(0)
    run()
  }
  const pause = () => {
    stopLoop()
    go('paused')
  }
  const stop = () => {
    stopLoop()
    go('off')
  }
  const toggle = () => {
    if (live.current.state === 'running') pause()
    else if (live.current.state === 'paused') run()
    else start()
  }

  /**
   * Move the sheet — to a section, say. Gliding there, as the jump bar does,
   * would be undone by the next frame here: the glide is cut short by the
   * sheet being put where autoscroll had it. So while autoscroll is on the
   * jump is made at once, and it carries on from there.
   */
  const scrollTo = (y: number) => {
    if (live.current.state === 'off') {
      scrollRef.current?.scrollTo({ y, animated: true })
      return
    }
    live.current.lastFrame = 0
    write(y)
  }

  const changeSpeed = (delta: number) => {
    const next = clampLevel(level + delta)
    if (next === level) return
    setLevel(next)
    if (sheetId) rememberSpeeds(withSpeed(cachedSpeeds ?? parseSpeeds(null), sheetId, next))
  }

  // ...and from the top, with the last sheet's loop stopped.
  useEffect(() => {
    stopLoop()
    live.current.state = 'off'
    live.current.y = 0
    live.current.written = 0
  }, [sheetId])

  useEffect(() => () => stopLoop(), [])

  // Awake while it runs or waits to go on; the phone may sleep again after.
  const awake = state !== 'off'
  useEffect(() => {
    if (!awake) return
    activateKeepAwakeAsync(AWAKE_TAG).catch(() => {})
    return () => {
      deactivateKeepAwake(AWAKE_TAG).catch(() => {})
    }
  }, [awake])

  /**
   * For the whole viewer, in the capture phase, so every touch is seen —
   * buttons included — before anything handles it.
   */
  const viewerTouchProps = {
    onTouchStartCapture: () => {
      live.current.fingerDown = true
    },
    onTouchEndCapture: (e: GestureResponderEvent) => {
      if ((e.nativeEvent.touches?.length ?? 0) > 0) return
      live.current.fingerDown = false
      live.current.stillUntil = performance.now() + AFTER_TOUCH_MS
    },
    onTouchCancelCapture: () => {
      live.current.fingerDown = false
      live.current.stillUntil = performance.now() + AFTER_TOUCH_MS
    },
  }

  /** Everything the scroll view needs to hand over. */
  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const l = live.current
      const y = e.nativeEvent.contentOffset.y
      // Not where this put it: a hand, its momentum, or a jump.
      if (Math.abs(y - l.written) > 3) {
        l.y = y
        l.written = y
        l.movedByOther = performance.now()
      }
    },
    onLayout: (e: LayoutChangeEvent) => {
      live.current.viewHeight = e.nativeEvent.layout.height
    },
    onContentSizeChange: (_w: number, h: number) => {
      live.current.contentHeight = h
    },
    onTouchStart: (e: GestureResponderEvent) => {
      const l = live.current
      l.touching = true
      const { pageX, pageY } = e.nativeEvent
      l.touchStart = { x: pageX, y: pageY, t: performance.now(), moved: 0 }
    },
    onTouchMove: (e: GestureResponderEvent) => {
      const s = live.current.touchStart
      const { pageX, pageY } = e.nativeEvent
      s.moved = Math.max(s.moved, Math.hypot(pageX - s.x, pageY - s.y))
    },
    onTouchEnd: () => {
      const l = live.current
      l.touching = false
      l.movedByOther = performance.now()
      // A tap pauses and resumes — once autoscroll is on; a tap before then
      // is only a tap.
      if (l.state !== 'off' && isTap(l.touchStart.moved, performance.now() - l.touchStart.t)) {
        toggle()
      }
    },
    onTouchCancel: () => {
      live.current.touching = false
    },
  }

  return {
    state,
    level,
    start,
    pause,
    resume: run,
    stop,
    toggle,
    changeSpeed,
    scrollTo,
    scrollProps,
    viewerTouchProps,
  }
}
