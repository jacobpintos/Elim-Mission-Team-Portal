/**
 * Lets the home-screen app open with no signal — see
 * scripts/service-worker.js, which the web build writes out as /sw.js.
 *
 * Not in development: there is no sw.js there, and a worker keeping copies of
 * files is the last thing wanted while they are being changed.
 */
export function registerServiceWorker(): void {
  if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
  // After the app has loaded, so the worker's own downloads never compete
  // with the first screen for the connection.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
