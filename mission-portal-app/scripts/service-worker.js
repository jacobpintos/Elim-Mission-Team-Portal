/* global VERSION, FILES */
/**
 * The web app's service worker: what lets the home-screen app open with no
 * signal.
 *
 * Written into dist/ as sw.js by build-service-worker.mjs, which puts the
 * build's VERSION and FILES ahead of this.
 *
 * - The page (index.html) comes from the network whenever there is one, so a
 *   deploy reaches people exactly as it did before this existed. Only with no
 *   network — or one too slow to answer in a few seconds — is the copy kept
 *   here served, together with the code it was built with.
 * - The build's own files (/_expo/…, /assets/…) have their content's hash in
 *   their names, so a copy of one is never out of date: they come from here
 *   first. Files from an earlier build that are still wanted are copied over
 *   rather than downloaded again.
 * - Nothing else is touched: Firebase, Storage, YouTube and the rest are other
 *   sites, and the set-list audio has its own cache (audioCache.ts).
 */

const SHELL = 'shell-'
const CURRENT = SHELL + VERSION
const PAGE = '/index.html'
/** How long the network has to answer for the page before the kept one is used. */
const PAGE_WAIT_MS = 4000

const isBuildFile = (path) => path.startsWith('/_expo/') || path.startsWith('/assets/')

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CURRENT)
      const earlier = (await caches.keys()).filter((k) => k.startsWith(SHELL) && k !== CURRENT)
      await Promise.all(
        FILES.map(async (path) => {
          if (isBuildFile(path)) {
            for (const name of earlier) {
              const kept = await (await caches.open(name)).match(path)
              if (kept) return cache.put(path, kept)
            }
          }
          const res = await fetch(new Request(path, { cache: 'reload' }))
          if (!res.ok) throw new Error(`${path}: ${res.status}`)
          return cache.put(path, res)
        })
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep this build and the one before it: a page that loaded before this
      // deploy may still ask for one of its own files, which the site no
      // longer has.
      const shells = (await caches.keys()).filter((k) => k.startsWith(SHELL))
      const keep = new Set([CURRENT, shells.filter((k) => k !== CURRENT).pop()])
      await Promise.all(shells.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

async function keptPage() {
  return (await (await caches.open(CURRENT)).match(PAGE)) ?? (await caches.match(PAGE))
}

async function page(request) {
  const network = fetch(request)
  // Answered by the kept page, a network that fails later has nobody to tell.
  network.catch(() => {})
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_WAIT_MS, null))
  try {
    const res = await Promise.race([network, timeout])
    if (res) return res
  } catch {
    // No network: the kept page, below.
  }
  const kept = await keptPage()
  // Nothing kept — wait the network out after all, as without this worker.
  return kept ?? network
}

async function buildFile(request, path) {
  const kept = await caches.match(path)
  if (kept) return kept
  const res = await fetch(request)
  if (res.ok) {
    const copy = res.clone()
    caches
      .open(CURRENT)
      .then((cache) => cache.put(path, copy))
      .catch(() => {})
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Firebase's own pages on this site (sign-in handlers).
  if (url.pathname.startsWith('/__/')) return

  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (isBuildFile(url.pathname)) event.respondWith(buildFile(request, url.pathname))
  else if (FILES.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(url.pathname)) ?? Response.error())
    )
  }
})
