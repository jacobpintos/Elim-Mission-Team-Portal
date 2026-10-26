/**
 * Opening the app without waiting out a stalled sign-in check.
 *
 * When the app opens with someone signed in, Firebase Auth checks the saved
 * sign-in with Google before it says who that is: it renews the sign-in's
 * token if it has run out, then reloads the account. Nothing waits on that
 * more than Firestore, which starts nothing — not even reading the copy kept
 * on the device — until Auth has answered. On a good connection the check
 * takes a moment. On one that has gone quiet (a home-screen web app opened
 * after a while closed, a weak signal) the request just hangs, and Firebase
 * waits out its own limit — 30 seconds in a browser, 60 in the native app —
 * then gives up and carries on signed in, as it does with no signal at all.
 *
 * This lets it come to that sooner: while the app is opening, the check's
 * requests have a few seconds each, and one that hasn't answered by then is
 * stopped, which Firebase takes as no signal. Nothing is skipped for good:
 * the token is renewed again as soon as anything needs it, with no limit
 * but Firebase's own, and an account that has been disabled or deleted is
 * signed out when that renewal is refused, as before.
 *
 * Pure apart from the fetch it wraps, so it can be tested.
 */

/** The check's two requests: renewing the token, and reloading the account. */
const CHECK =
  /securetoken\.googleapis\.com\/v1\/token|identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/

/** How long each has to answer while the app opens. */
export const CHECK_WAIT_MS = 4000

type Fetch = (
  input: unknown,
  init?: { signal?: unknown } & Record<string, unknown>
) => Promise<unknown>

const urlOf = (input: unknown): string =>
  typeof input === 'string' ? input : ((input as { url?: string })?.url ?? String(input))

/**
 * From now until the returned function is called, a sign-in check request
 * that takes longer than CHECK_WAIT_MS is stopped. `onCut` hears when one is.
 */
export function hurryOpeningCheck(onCut?: () => void): () => void {
  const scope = globalThis as unknown as { fetch?: Fetch }
  const original = scope.fetch
  if (typeof original !== 'function' || typeof AbortController === 'undefined') return () => {}

  const hurried: Fetch = (input, init) => {
    // Anything else, or a request that is already stoppable by its sender, goes as it was.
    if (!CHECK.test(urlOf(input)) || init?.signal) return original.call(globalThis, input, init)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      onCut?.()
      controller.abort()
    }, CHECK_WAIT_MS)
    return original
      .call(globalThis, input, { ...init, signal: controller.signal })
      .finally(() => clearTimeout(timer))
  }

  scope.fetch = hurried
  return () => {
    // Only if nothing has wrapped fetch since.
    if (scope.fetch === hurried) scope.fetch = original
  }
}
