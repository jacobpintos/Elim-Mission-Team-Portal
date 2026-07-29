import { Platform } from 'react-native'

/**
 * Props that make a Tamagui `Input` actually mask a password.
 *
 * Tamagui's web Input strips `secureTextEntry` — it destructures the prop out
 * with the other React Native-only props and never maps it to the DOM, so the
 * field renders as `type="text"` and the password is visible as you type. Only
 * the native build honours `secureTextEntry`.
 *
 * So we send both: `secureTextEntry` for iOS/Android, and an explicit `type`
 * for web, which Tamagui forwards to the underlying input element.
 *
 * @param hidden whether the value should be masked right now
 */
export function passwordInputProps(hidden: boolean): Record<string, unknown> {
  return {
    secureTextEntry: hidden,
    ...(Platform.OS === 'web' ? { type: hidden ? 'password' : 'text' } : {}),
  }
}
