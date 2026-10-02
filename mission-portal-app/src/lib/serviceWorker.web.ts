/**
 * Lets the home-screen app open with no signal — see
 * scripts/service-worker.js, which the web build writes out as /sw.js.
 *
 * Not in development: there is no sw.js there, and a worker keeping copies of
 * files is the last thing wanted while they are being changed.
 */
export function registerServiceWorker(): void {
  if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  reloadWhenStale()
  const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
  // After the app has loaded, so the worker's own downloads never compete
  // with the first screen for the connection.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

/** How long the app has to have been away for a new version to be loaded on its return. */
const AWAY_MS = 10 * 60 * 1000

/**
 * Load a newer version, if there is one, when the app comes back after a
 * while away.
 *
 * A home-screen web app is rarely closed: it waits in the background, still
 * running the code it started with, for days. The page comes fresh from the
 * network whenever the app starts (sw.js), but a resumed app never starts —
 * so an iPad that was last opened a week ago showed the week-old app, with
 * none of what had changed since. Coming back after ten minutes or more,
 * the app checks which build the site is serving now and reloads into it if
 * it is not this one. Never while a chord sheet is open, which may be in
 * use on stage; it is checked again the next time instead. Silent: the app
 * simply opens as the newer one.
 */
function reloadWhenStale() {
  const running = currentBuild(document)
  if (!running) return
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (!hiddenAt || Date.now() - hiddenAt < AWAY_MS) return
    if (document.getElementById(CHORD_SHEET_ID)) return
    fetch('/', { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((html) => {
        const served = currentBuild(new DOMParser().parseFromString(html, 'text/html'))
        if (served && served !== running && !document.getElementById(CHORD_SHEET_ID)) {
          window.location.reload()
        }
      })
      .catch(() => {
        // No signal: carry on with this one.
      })
  })
}

/** The chord sheet's content (ChordSheetViewer), there while one is open. */
const CHORD_SHEET_ID = 'chord-sheet-content'

/** The build a page is, by the name of its entry script — which has the build's hash in it. */
function currentBuild(doc: Document): string | null {
  const src = doc.querySelector<HTMLScriptElement>('script[src*="/_expo/static/js/web/entry-"]')
  return src?.getAttribute('src') ?? null
}
