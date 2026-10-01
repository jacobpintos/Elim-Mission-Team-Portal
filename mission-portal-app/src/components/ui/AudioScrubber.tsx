import { useRef, useState } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { useThemeColors } from '@/theme/useThemeColors'
import { fractionAt } from '@/lib/audioSeek'

const HEIGHT = 28

/**
 * Tell the browser this drag is ours.
 *
 * Without it a browser treats a finger sliding along the bar as its own
 * gesture: a drag with any vertical in it scrolls the set list instead and
 * cancels the scrub, and in Chromium one sliding off the edge was taken as
 * swipe-to-go-back and navigated away from the app altogether — found
 * driving this bar in the browser. Native has no such gesture to stop.
 */
const OWN_THE_DRAG = (Platform.OS === 'web' ? { touchAction: 'none' } : {}) as ViewStyle
const THUMB = 14
const THUMB_DRAGGING = 20

/**
 * A bar you can drag along to move through a track, or tap to jump.
 *
 * It replaces a 3pt line that took taps only, padded by a hitSlop that
 * react-native-web ignores — on the PWA the thing you had to hit was three
 * points tall. This one answers across its full height, follows a finger
 * dragged along it, and shows where it will land before letting go: the time
 * passed to onDrag is what the caller shows while dragging, and the seek
 * itself happens once, on release, so the audio is not asked to jump a
 * hundred times a second while somebody hunts for the bridge.
 *
 * Built on the responder system rather than anything web-only, so the same
 * bar works on the phone app. It keeps the gesture once it has it — a drag
 * that wanders up or down is still a drag, not the set list scrolling.
 */
export function AudioScrubber({
  progress,
  enabled,
  onSeek,
  onDrag,
  onStep,
}: {
  /** Where the track is, 0 to 1. */
  progress: number
  enabled: boolean
  /** Released at this fraction of the track. */
  onSeek: (fraction: number) => void
  /** Being dragged, at this fraction; null when the finger lifts. */
  onDrag?: (fraction: number | null) => void
  /** Assistive technology's increment and decrement, in seconds. */
  onStep?: (seconds: number) => void
}) {
  const colors = useThemeColors()
  const [width, setWidth] = useState(0)
  const [dragging, setDragging] = useState<number | null>(null)
  // Where the bar starts on the page. Taken when a touch begins, from the
  // touch itself — its page position less its position within the bar — so
  // the moves that follow can be measured against it however far they stray.
  const barLeft = useRef(0)

  const shown = dragging ?? Math.min(1, Math.max(0, progress))
  const thumb = dragging === null ? THUMB : THUMB_DRAGGING

  const follow = (pageX: number) => {
    const f = fractionAt(pageX, barLeft.current, width)
    setDragging(f)
    onDrag?.(f)
    return f
  }

  return (
    <View
      style={[
        { height: HEIGHT, justifyContent: 'center', opacity: enabled ? 1 : 0.5 },
        OWN_THE_DRAG,
      ]}
      // The bar answers for itself: nothing inside it takes the touch, so
      // locationX is always measured from the bar's own left edge.
      pointerEvents="box-only"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => enabled && width > 0}
      onMoveShouldSetResponder={() => enabled && width > 0}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        barLeft.current = e.nativeEvent.pageX - e.nativeEvent.locationX
        follow(e.nativeEvent.pageX)
      }}
      onResponderMove={(e) => {
        follow(e.nativeEvent.pageX)
      }}
      onResponderRelease={(e) => {
        const f = fractionAt(e.nativeEvent.pageX, barLeft.current, width)
        setDragging(null)
        onDrag?.(null)
        onSeek(f)
      }}
      onResponderTerminate={() => {
        setDragging(null)
        onDrag?.(null)
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="Position in track"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onStep?.(10)
        if (e.nativeEvent.actionName === 'decrement') onStep?.(-10)
      }}
    >
      <View
        style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}
      >
        <View
          style={{ width: `${shown * 100}%`, height: '100%', backgroundColor: colors.primary }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: (HEIGHT - thumb) / 2,
          left: Math.max(0, Math.min(width - thumb, shown * width - thumb / 2)),
          width: thumb,
          height: thumb,
          borderRadius: thumb / 2,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  )
}
