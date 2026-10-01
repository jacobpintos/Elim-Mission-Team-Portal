import { useEffect, useState } from 'react'
import {
  Dialog,
  Sheet,
  ScrollView,
  Text,
  H2,
  YStack,
  type DialogProps,
  useWindowDimensions,
} from 'tamagui'
import { ScrollView as RNScrollView, Platform, Pressable, StyleSheet } from 'react-native'
import { useKeyboardHeight } from '@/lib/useKeyboardHeight'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'

/**
 * Tamagui's portal is position: fixed on the web — the same box that put every
 * tap fifty points below its button on an iPhone held sideways (see
 * FullScreenOverlay.web.tsx). It spreads a style of ours after its own, so the
 * sheet can have absolute instead; the app's body is the viewport and does not
 * scroll, so it covers the screen just the same.
 */
export const ABSOLUTE_PORTAL =
  Platform.OS === 'web' ? ({ style: { position: 'absolute' } } as const) : undefined

interface ModalProps extends Omit<DialogProps, 'children'> {
  title?: string
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  scrollable?: boolean
}

/**
 * Responsive modal: centered dialog on large screens, bottom sheet on small.
 */
export function Modal({ title, children, open, onOpenChange, scrollable, ...props }: ModalProps) {
  const { width } = useWindowDimensions()
  const isLarge = width >= 768
  const keyboardHeight = useKeyboardHeight()

  // Never hand Tamagui an already-open modal on the very first render.
  //
  // Both Dialog and Sheet animate from a closed state, and a component that
  // mounts open has none to animate from — the content is placed but never
  // transitions in, so nothing appears and the press looks ignored. That is
  // easy to hit from the outside: any caller that keys this on the record
  // being edited (`key={target?.id ?? 'none'}`) remounts it at the exact
  // moment it opens.
  //
  // Deferring by a frame gives the animation a closed state to start from,
  // and costs one frame on modals that were already working.
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPainted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const isOpen = open && painted

  if (isLarge) {
    // The dialog cannot take the same fix: its portal is built without a style
    // of ours, and the frame inside it is fixed as well. And this is the branch
    // a phone takes in landscape — sideways it is wider than 768 — so on the
    // web the dialog is drawn here instead, over the absolute overlay.
    if (Platform.OS === 'web') {
      return (
        <FullScreenOverlay
          visible={isOpen}
          animationType="fade"
          transparent
          onRequestClose={() => onOpenChange(false)}
        >
          <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
            {/* Tapping outside closes it, as the dialog did. */}
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={() => onOpenChange(false)}
              accessibilityLabel="Close"
            />
            <YStack
              backgroundColor="$background"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$4"
              padding="$4"
              gap="$4"
              minWidth={400}
              maxWidth={600}
              elevation="$4"
            >
              {title && <H2>{title}</H2>}
              {scrollable ? (
                <ScrollView style={{ maxHeight: 500 }}>{children}</ScrollView>
              ) : (
                children
              )}
            </YStack>
          </YStack>
        </FullScreenOverlay>
      )
    }
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange} {...props}>
        <Dialog.Portal>
          <Dialog.Overlay key="overlay" opacity={0.5} backgroundColor="black" />
          <Dialog.Content bordered elevate key="content" gap="$4" minWidth={400} maxWidth={600}>
            {title && <Dialog.Title>{title}</Dialog.Title>}
            {scrollable ? <ScrollView style={{ maxHeight: 500 }}>{children}</ScrollView> : children}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    )
  }

  return (
    // disableDrag: Sheet's drag-to-dismiss gesture and the inner ScrollView
    // compete for touches at the scroll boundary — tapping something near
    // the bottom of a long form (once scrolled all the way down, so there's
    // no more scroll left to "absorb" the gesture) could be interpreted as a
    // sheet drag, snapping/relaying the sheet and resetting the ScrollView's
    // scroll position back to the top. Every caller of this Modal already
    // renders its own Cancel/Close control, so disabling the swipe-to-dismiss
    // gesture doesn't remove any way to close it.
    <Sheet
      open={isOpen}
      onOpenChange={onOpenChange}
      snapPoints={[85]}
      dismissOnSnapToBottom
      disableDrag
      modal
      portalProps={ABSOLUTE_PORTAL}
    >
      <Sheet.Overlay backgroundColor="rgba(0,0,0,0.5)" />
      <Sheet.Frame padding="$4" gap="$2">
        <Sheet.Handle />
        {title && (
          <Text fontSize="$6" fontWeight="600">
            {title}
          </Text>
        )}
        {/* A plain ScrollView, not Sheet.ScrollView. Sheet.ScrollView exists to
            bridge scrolling into the sheet's drag gesture, which disableDrag
            above already rules out — and its fallback path (taken whenever
            @tamagui/native/setup-gesture-handler is not imported, as here)
            attaches responder handlers that call scrollTo({ y:
            currentScrollOffset.current }). That ref is only ever assigned on
            its react-native-gesture-handler path, so in this one it stays 0
            and every downward scroll snapped the form back to the top. */}
        <RNScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Sheet.ScrollView padded for the keyboard itself; a plain one does
          // not, and the sheet frame is already positioned so shrinking it
          // with KeyboardAvoidingView fights the sheet's own layout.
          contentContainerStyle={{ paddingBottom: keyboardHeight }}
        >
          {children}
        </RNScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
