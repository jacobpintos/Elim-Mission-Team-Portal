import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * Height the on-screen keyboard currently occupies, or 0 when it's hidden.
 *
 * Used to pad the bottom of scrollable forms that can't rely on
 * KeyboardAvoidingView — inside a bottom sheet the frame is already
 * positioned, so shrinking it fights the sheet's own layout.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    // iOS reports the frame before the animation so padding lands in step with
    // the keyboard; Android only emits the did* pair.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return height
}
