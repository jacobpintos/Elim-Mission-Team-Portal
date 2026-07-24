// TEMPORARY DIAGNOSTIC HELPERS — shared between index.js and app code.
//
// Two separate AsyncStorage keys:
// - FATAL_ERROR_KEY: a genuine caught JS Error/rejection, shown verbatim.
// - PROGRESS_KEY: a breadcrumb trail of the last few checkpoints reached,
//   so that even a hard native crash that bypasses JS entirely (no catchable
//   exception) still leaves a record of how far execution got.
//
// index.js checks both on the next launch and displays whatever it finds.
import AsyncStorage from '@react-native-async-storage/async-storage'

export const FATAL_ERROR_KEY = '__diagnostic_last_fatal_error__'
export const PROGRESS_KEY = '__diagnostic_progress_trail__'

export function logDiagnosticError(label: string, error: unknown): void {
  const err = error as { message?: string; stack?: string } | undefined
  const message = `${label}: ${err?.message ?? String(error)}\n\n${err?.stack ?? '(no stack)'}`
  AsyncStorage.setItem(FATAL_ERROR_KEY, message).catch(() => {})
}

export async function markProgress(step: string): Promise<void> {
  try {
    const existing = (await AsyncStorage.getItem(PROGRESS_KEY)) ?? ''
    const trail = `${existing}${existing ? '\n' : ''}${new Date().toISOString().slice(11, 23)} ${step}`
    const lines = trail.split('\n')
    const trimmed = lines.length > 20 ? lines.slice(lines.length - 20).join('\n') : trail
    await AsyncStorage.setItem(PROGRESS_KEY, trimmed)
  } catch {
    // ignore — diagnostics must never themselves throw
  }
}

export async function clearProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY)
  } catch {
    // ignore
  }
}
