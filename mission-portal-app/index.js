// TEMPORARY DIAGNOSTIC ENTRY POINT.
//
// The production build crashes on launch with EXC_CRASH/SIGABRT via RCTFatal,
// meaning an uncaught JS exception is thrown very early (during module import,
// before the router even mounts). Apple's crash reporter doesn't preserve the
// JS error message/stack, and Expo Go can't load this project (SDK version
// mismatch) to get a red-screen trace instead.
//
// First attempt (showing Alert.alert() immediately from inside the error
// handler) caused a *second*, different crash: presenting a UIAlertController
// this early, re-entrantly from inside exception handling, crashed in UIKit's
// safe-area code before the alert could render. So instead: persist the error
// to AsyncStorage immediately (cheap, no UI involved), and display it on the
// NEXT app launch, before ever requiring the crashing module chain.
//
// Revert this file and package.json's "main" field back to "expo-router/entry"
// once the real error has been identified and fixed.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'

const STORAGE_KEY = '__diagnostic_last_fatal_error__'

if (global.ErrorUtils) {
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const message = `${isFatal ? 'FATAL' : 'non-fatal'}: ${error?.message ?? String(error)}\n\n${error?.stack ?? '(no stack)'}`
    AsyncStorage.setItem(STORAGE_KEY, message).catch(() => {})
  })
}

AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
      setTimeout(() => {
        try {
          Alert.alert('Previous startup error', stored.slice(0, 3000))
        } catch {
          // ignore
        }
      }, 500)
      return
    }
    startWatchdogAndLoadApp()
  })
  .catch(() => {
    startWatchdogAndLoadApp()
  })

function startWatchdogAndLoadApp() {
  // If the app hangs before ever reaching a first render (no thrown error, so
  // our ErrorUtils handler never fires), this fires instead and tells us how
  // far execution actually got.
  setTimeout(() => {
    if (!global.__rootLayoutCalled) {
      const moduleLoaded = Boolean(global.__layoutModuleLoaded)
      try {
        Alert.alert(
          'Startup watchdog (diagnostic build)',
          `App did not reach RootLayout within 8s.\n\n` +
            `_layout.tsx module finished loading: ${moduleLoaded}\n\n` +
            (moduleLoaded
              ? 'Module imports all resolved, but React never called RootLayout — hang is likely in expo-router itself or something between module load and first render.'
              : 'Hung while evaluating _layout.tsx\'s own imports (e.g. firebase.ts, tamagui config, a store file) — before RootLayout could even be defined/called.')
        )
      } catch {
        // ignore
      }
    }
  }, 8000)
  require('expo-router/entry')
}
