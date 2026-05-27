/**
 * Simple in-memory throttle for Cloud Function handlers.
 * Note: this resets on cold start — use Firestore for persistent rate limiting.
 */
export function createThrottle(maxCalls: number, windowMs: number) {
  const calls: number[] = []

  return function throttle(): boolean {
    const now = Date.now()
    const windowStart = now - windowMs

    // Remove old calls outside the window
    while (calls.length > 0 && calls[0] < windowStart) {
      calls.shift()
    }

    if (calls.length >= maxCalls) {
      return false // throttled
    }

    calls.push(now)
    return true // allowed
  }
}
