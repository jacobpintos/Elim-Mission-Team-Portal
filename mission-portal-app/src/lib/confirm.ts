import { Alert, Platform } from 'react-native'

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

/**
 * Cross-platform confirmation dialog.
 *
 * `window.confirm` does not exist in React Native — calling it on iOS/Android
 * throws `window.confirm is not a function` and takes the screen down with it.
 * Use this everywhere a yes/no prompt is needed.
 */
export function confirmAsync(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const {
    title = 'Are you sure?',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    destructive = false,
  } = opts

  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(message)
        : false
    )
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ])
  })
}
