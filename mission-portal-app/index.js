// TEMPORARY DIAGNOSTIC ENTRY POINT.
//
// The production build has been crashing on launch with EXC_CRASH/SIGABRT via
// RCTFatal, which means an uncaught JS exception is being thrown very early
// (during module import, before the router even mounts). Apple's crash
// reporter doesn't preserve the JS error message/stack, and Expo Go can't
// load this project (SDK version mismatch), so this intercepts the error
// directly and displays it on-screen instead of letting it silently abort.
//
// Revert this file and package.json's "main" field back to "expo-router/entry"
// once the real error has been identified and fixed.
import { Alert } from 'react-native'

if (global.ErrorUtils) {
  const defaultHandler = global.ErrorUtils.getGlobalHandler()
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const message = `${isFatal ? 'FATAL' : 'non-fatal'}: ${error?.message ?? String(error)}\n\n${error?.stack ?? '(no stack)'}`
    try {
      Alert.alert('Startup error (diagnostic build)', message.slice(0, 3000))
    } catch {
      // ignore — Alert itself may not be available this early
    }
    // Intentionally do NOT call defaultHandler here — we want to see the
    // alert rather than have the app immediately crash again.
    void defaultHandler
  })
}

require('expo-router/entry')
