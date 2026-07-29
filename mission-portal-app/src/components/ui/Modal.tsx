import { Dialog, Sheet, ScrollView, Text, type DialogProps, useWindowDimensions } from 'tamagui'

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

  if (isLarge) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} {...props}>
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
      open={open}
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
        <Sheet.ScrollView showsVerticalScrollIndicator={false}>{children}</Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
