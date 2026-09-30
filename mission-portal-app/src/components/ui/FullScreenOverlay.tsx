import type { ReactNode } from 'react'
import { Modal } from 'react-native'

/**
 * A full-screen layer over the app.
 *
 * Native gets a real Modal. The web build of this file does not — see
 * FullScreenOverlay.web.tsx for why a fixed-position modal is the wrong thing
 * to put a control bar inside on a phone held sideways.
 */
export function FullScreenOverlay({
  children,
  onRequestClose,
}: {
  children: ReactNode
  onRequestClose: () => void
}) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onRequestClose}>
      {children}
    </Modal>
  )
}
