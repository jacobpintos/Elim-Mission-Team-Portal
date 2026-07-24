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
// Second bug found: the previous version called startWatchdogAndLoadApp()
// (which calls require('expo-router/entry')) from BOTH a .then() and a
// sibling .catch() on the same promise chain — so if require() ever threw
// synchronously, that exception was caught by the .catch() and the whole
// broken require was retried a second time, corrupting AppRegistry
// registration into "main has not been registered". Rewritten below as a
// single linear async function with require() called from exactly one place.
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

async function main() {
  let stored = null
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY)
  } catch {
    // ignore — proceed as if there was nothing stored
  }

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

  // If the app hangs before ever reaching a first render (no thrown error, so
  // our ErrorUtils handler never fires), this fires instead and tells us how
  // far execution actually got.
  setTimeout(() => {
    if (!global.__rootLayoutCalled) {
      const checkpoints = [
        ['roles.ts', global.__diag_rolesLoaded],
        ['tamagui.config.ts', global.__diag_tamaguiConfigLoaded],
        ['firebase.ts', global.__diag_firebaseLoaded],
        ['themeStore.ts', global.__diag_themeStoreLoaded],
        ['DynamicThemeProvider.tsx', global.__diag_dynamicThemeProviderLoaded],
        ['notifications.ts', global.__diag_notificationsLoaded],
        ['authStore.ts', global.__diag_authStoreLoaded],
        ['Toast.tsx', global.__diag_toastLoaded],
        ['_layout.tsx (whole module)', global.__layoutModuleLoaded],
      ]
      const lines = checkpoints.map(([name, done]) => `${done ? '✓' : '✗'} ${name}`).join('\n')
      try {
        Alert.alert(
          'Startup watchdog (diagnostic build)',
          `App did not reach RootLayout within 8s.\n\n${lines}`
        )
      } catch {
        // ignore
      }
    }
  }, 8000)

  require('expo-router/entry')
}

main()
