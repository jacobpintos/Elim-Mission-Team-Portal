import { Platform } from 'react-native'
import { Stack } from 'expo-router'

type ScreenOptions = React.ComponentProps<typeof Stack.Screen>['options']

/**
 * On native: renders Stack.Screen to set header title and options.
 * On web: no-op — Stack.Screen causes React error #185 on browser back
 * navigation because its internal useLayoutEffect re-fires when the
 * navigation object identity changes during popstate handling.
 */
export function ScreenTitle({ options }: { options: ScreenOptions }) {
  if (Platform.OS === 'web') return null
  return <Stack.Screen options={options} />
}
