import { useState } from 'react'
import { Modal, Image, Pressable, Platform, useWindowDimensions, View } from 'react-native'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { XStack, Text } from 'tamagui'
import { useUIStore } from '@/stores/uiStore'
import {
  clampScale,
  clampPan,
  panBounds,
  zoomAboutFocal,
  containedSize,
  nextDoubleTapScale,
  MIN_SCALE,
} from '@/lib/imageZoom'

interface ImageLightboxProps {
  /** The image to show, or null when nothing is open. */
  uri: string | null
  onClose: () => void
  /** Used for the saved filename; falls back to something generic. */
  name?: string
}

/**
 * A picture, full screen, that can be pinched, dragged, saved and copied.
 *
 * Everything positional lives in shared values rather than React state. This
 * codebase has been bitten repeatedly by worklets capturing a stale copy of
 * state — a gesture reads whatever was current when the handler was built, not
 * when the finger moved — and the arithmetic itself is in @/lib/imageZoom so it
 * can be tested off the UI thread, where none of it can be observed.
 */
export function ImageLightbox({ uri, onClose, name }: ImageLightboxProps) {
  const toast = useUIStore((s) => s.toast)
  const viewport = useWindowDimensions()
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const scale = useSharedValue(MIN_SCALE)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)

  // Plain values, captured by the worklets below rather than mirrored into
  // shared values. Gesture objects are rebuilt on every render, so each one
  // closes over the current size — there is no stale copy to go wrong, and no
  // effect writing to shared state.
  //
  // The lightbox is mounted with key={uri} by its caller, so a new picture
  // gets fresh shared values at their defaults and needs no reset.
  const fitted = containedSize(natural, viewport)
  const view = { width: viewport.width, height: viewport.height }

  const settle = () => {
    'worklet'
    const bounds = panBounds(scale.value, fitted, view)
    const next = clampPan(tx.value, ty.value, bounds)
    tx.value = withTiming(next.x, { duration: 120 })
    ty.value = withTiming(next.y, { duration: 120 })
  }

  const startScale = useSharedValue(MIN_SCALE)
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value
    })
    .onUpdate((e) => {
      // Focal point arrives relative to the view's top-left; translation is
      // measured from its centre, so shift it into the same frame.
      const focal = { x: e.focalX - view.width / 2, y: e.focalY - view.height / 2 }
      const next = zoomAboutFocal(
        { scale: scale.value, tx: tx.value, ty: ty.value },
        startScale.value * e.scale,
        focal
      )
      scale.value = next.scale
      tx.value = next.tx
      ty.value = next.ty
    })
    .onEnd(settle)

  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = tx.value
      startY.value = ty.value
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX
      ty.value = startY.value + e.translationY
    })
    .onEnd(settle)

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const target = nextDoubleTapScale(scale.value)
      const focal = { x: e.x - view.width / 2, y: e.y - view.height / 2 }
      const next = zoomAboutFocal({ scale: scale.value, tx: tx.value, ty: ty.value }, target, focal)
      const bounds = panBounds(next.scale, fitted, view)
      const settled = clampPan(next.tx, next.ty, bounds)
      scale.value = withTiming(next.scale, { duration: 160 })
      tx.value = withTiming(settled.x, { duration: 160 })
      ty.value = withTiming(settled.y, { duration: 160 })
    })

  // A single tap closes, but only when the picture is not zoomed — otherwise
  // every failed drag would dismiss what someone is trying to look at.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (clampScale(scale.value) <= MIN_SCALE + 0.01) runOnJS(onClose)()
    })

  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pinch, pan), doubleTap, singleTap)

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }))

  const filename = (name ?? 'image').replace(/[^\w.-]/g, '_') || 'image'

  /** Pull the picture down to a local file so it can be shared or copied. */
  const downloadToCache = async (): Promise<string> => {
    const { File, Directory, Paths } = await import('expo-file-system')
    const target = await File.downloadFileAsync(uri!, new Directory(Paths.cache))
    return target.uri
  }

  const handleSave = async () => {
    if (!uri) return
    setBusy(true)
    try {
      if (Platform.OS === 'web') {
        // The browser's own download, which is what a web user expects.
        const a = document.createElement('a')
        a.href = uri
        a.download = filename
        a.rel = 'noopener'
        a.target = '_blank'
        a.click()
        return
      }
      const Sharing = await import('expo-sharing')
      if (!(await Sharing.isAvailableAsync())) {
        toast('Sharing is not available on this device', 'error')
        return
      }
      // The OS share sheet rather than writing to the photo library directly:
      // it already offers Save Image, Copy, AirDrop and Messages, and it needs
      // no photo-library-add permission of its own.
      await Sharing.shareAsync(await downloadToCache())
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not save the image', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!uri) return
    setBusy(true)
    try {
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob()
        // Only PNG is guaranteed across browsers; anything else is refused by
        // the clipboard rather than silently pasting nothing.
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        toast('Image copied', 'success')
        return
      }
      const local = await downloadToCache()
      const Legacy = await import('expo-file-system/legacy')
      const base64 = await Legacy.readAsStringAsync(local, { encoding: 'base64' })
      const Clipboard = await import('expo-clipboard')
      await Clipboard.setImageAsync(base64)
      toast('Image copied', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not copy the image', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {uri ? (
                <Animated.View style={style}>
                  <Image
                    source={{ uri }}
                    style={{ width: viewport.width, height: viewport.height }}
                    resizeMode="contain"
                    onLoad={(e) => {
                      const src = e.nativeEvent?.source
                      if (src?.width && src?.height) {
                        setNatural({ width: src.width, height: src.height })
                      }
                    }}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
          </GestureDetector>

          {/* Sits above the gesture surface so the buttons are not swallowed
              by the pan that covers the whole screen. */}
          <XStack
            position="absolute"
            top={48}
            left={0}
            right={0}
            paddingHorizontal="$4"
            justifyContent="space-between"
            alignItems="center"
          >
            <Pressable onPress={onClose} accessibilityLabel="Close image">
              <Text color="white" fontSize="$6" fontWeight="700">
                ✕
              </Text>
            </Pressable>
            <XStack gap="$4" alignItems="center">
              <Pressable onPress={handleCopy} disabled={busy} accessibilityLabel="Copy image">
                <Text color="white" fontSize="$3" opacity={busy ? 0.5 : 1}>
                  Copy
                </Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={busy} accessibilityLabel="Save image">
                <Text color="white" fontSize="$3" opacity={busy ? 0.5 : 1}>
                  {busy ? 'Working…' : 'Save'}
                </Text>
              </Pressable>
            </XStack>
          </XStack>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
