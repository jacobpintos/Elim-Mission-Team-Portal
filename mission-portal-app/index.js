// TEMPORARY DIAGNOSTIC ENTRY POINT.
//
// Captures fatal startup JS errors (which Apple's crash logs don't preserve)
// to AsyncStorage and displays them via alert, plus a watchdog that reports
// how far module evaluation got if the app never reaches first render.
//
// CRITICAL constraint learned the hard way: React Native requires the entry
// module to register the root component ("main") SYNCHRONOUSLY during the
// bundle's initial evaluation. An earlier version of this file deferred
// require('expo-router/entry') until after an async AsyncStorage read — which
// caused 'Invariant Violation: "main" has not been registered' plus an
// eternal splash screen, alternating by launch depending on whether a stored
// error short-circuited the require. So: require runs unconditionally at top
// level, and the stored-error alert is shown ON TOP of the app asynchronously.
//
// Revert this file and package.json's "main" field back to "expo-router/entry"
// once the underlying issue is confirmed fixed.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'

// Kept as plain string literals (not imported from src/lib/diagnostics.ts)
// to keep this sensitive entry file's dependency graph minimal — must match
// FATAL_ERROR_KEY / PROGRESS_KEY there exactly.
const STORAGE_KEY = '__diagnostic_last_fatal_error__'
const PROGRESS_KEY = '__diagnostic_progress_trail__'

if (global.ErrorUtils) {
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const message = `${isFatal ? 'FATAL' : 'non-fatal'}: ${error?.message ?? String(error)}\n\n${error?.stack ?? '(no stack)'}`
    AsyncStorage.setItem(STORAGE_KEY, message).catch(() => {})
  })
}

// Watchdog: if the app hangs before first render (no thrown error, so the
// ErrorUtils handler never fires), report which modules finished evaluating.
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

// MUST be synchronous and unconditional — see header comment.
require('expo-router/entry')

// Show any stored error AND/OR progress trail from a previous launch on top
// of the (hopefully working) app. Delayed so the root view exists before
// presenting an alert. The progress trail is checked even when there's no
// fatal error, since a true native crash (Objective-C exception on a
// TurboModule queue) bypasses JS's ErrorUtils entirely and leaves no error —
// only the last breadcrumb written before the process died.
Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(PROGRESS_KEY)])
  .then(([storedError, progressTrail]) => {
    if (!storedError && !progressTrail) return
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
    AsyncStorage.removeItem(PROGRESS_KEY).catch(() => {})
    const parts = []
    if (storedError) parts.push(`ERROR:\n${storedError}`)
    if (progressTrail) parts.push(`LAST PROGRESS TRAIL (may be from a native crash with no catchable error):\n${progressTrail}`)
    setTimeout(() => {
      try {
        Alert.alert('Previous startup error', parts.join('\n\n---\n\n').slice(0, 3000))
      } catch {
        // ignore
      }
    }, 2000)
  })
  .catch(() => {})
