import { useEffect, useState } from 'react'
import { Dialog, Sheet, ScrollView, Text, type DialogProps, useWindowDimensions } from 'tamagui'
import { ScrollView as RNScrollView } from 'react-native'
import { useKeyboardHeight } from '@/lib/useKeyboardHeight'

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
