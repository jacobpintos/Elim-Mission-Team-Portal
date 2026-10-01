import { Modal, type ModalProps } from 'react-native'

/**
 * A full-screen layer over the app, with the same props as react-native's
 * Modal so it can stand in for one.
 *
 * Native gets the real Modal, props and all. The web build of this file does
 * not — see FullScreenOverlay.web.tsx for why a fixed-position modal is the
 * wrong thing to put controls inside on a phone held sideways.
 */
export function FullScreenOverlay({ visible = true, ...props }: ModalProps) {
  return <Modal visible={visible} {...props} />
}
