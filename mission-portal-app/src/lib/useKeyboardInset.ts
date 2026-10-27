import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * How much of the bottom of the screen the on-screen keyboard covers, or 0.
 *
 * Unlike useKeyboardHeight, this one works in a browser too — the
 * home-screen web app on an iPhone, where the keyboard fires no events of
 * its own. There the keyboard shortens the visual viewport while the page
 * underneath keeps its full height (+html.tsx: the body never scrolls), so
 * what it covers is the difference.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window === 'undefined' ? null : window.visualViewport
      if (!vv) return
      const update = () => {
        // Pinched in, the visual viewport is smaller for another reason.
        if (vv.scale > 1.05) return setInset(0)
        const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop)
        // A toolbar's worth is not a keyboard.
        setInset(covered > 80 ? covered : 0)
      }
      update()
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      return () => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }
    // iOS reports the frame before the animation; Android only the did* pair.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => setInset(e.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setInset(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return inset
}
