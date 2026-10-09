import type { ReactNode } from 'react'
import { Modal, View } from 'react-native'

/**
 * A layer above everything — a chord sheet open in its own overlay included —
 * that covers nothing it does not draw: no backdrop, nothing dimmed, so what
 * is beneath stays in sight. For a small floating bar, like Miriam's.
 *
 * Above a chord sheet, on a phone, that takes a modal of its own, and a
 * phone gives a modal every touch while it is up; the screen beneath can be
 * seen but not touched until it goes. On the web (./FloatingLayer.web.tsx)
 * it can be touched as well.
 */
export function FloatingLayer({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean
  onRequestClose: () => void
  children: ReactNode
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={{ flex: 1 }} pointerEvents="box-none">
        {children}
      </View>
    </Modal>
  )
}
