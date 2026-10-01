import { openExternalUrl, toExternalUrl } from '@/lib/externalUrl'
import { youTubeAppUrl } from '@/lib/youTubeAppUrl'

/**
 * Open a YouTube video in the YouTube app, from the web.
 *
 * On an iPhone the ordinary link opens in the browser iOS keeps inside a
 * home-screen app, which hands the video to the YouTube app and is then left
 * behind on a blank page, still over the portal when you come back. So on iOS
 * this goes to the app's own address instead (see youTubeAppUrl), which never
 * loads in that browser.
 *
 * An iPhone without the YouTube app has nothing to answer that address. If the
 * page has not been left, hidden or covered by a prompt within two seconds,
 * the ordinary link is opened after all — by navigating rather than opening a
 * window, because a window opened from a timer is a pop-up Safari blocks.
 *
 * Everywhere else — Android, a desktop browser — the ordinary link already
 * goes where it should, and is opened as before.
 */
const FALLBACK_MS = 2000

export function openInYouTube(webUrl: string, videoId: string | null): void {
  if (!videoId || !isIOS()) {
    void openExternalUrl(webUrl)
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('pagehide', stop)
    window.removeEventListener('blur', stop)
    document.removeEventListener('visibilitychange', onVisibility)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stop()
  }
  // Any of these means iOS did something with the address: switched to the
  // app, or put up its "Open in YouTube?" question.
  window.addEventListener('pagehide', stop)
  window.addEventListener('blur', stop)
  document.addEventListener('visibilitychange', onVisibility)
  timer = setTimeout(() => {
    stop()
    const fallback = toExternalUrl(webUrl)
    if (fallback) window.location.href = fallback
  }, FALLBACK_MS)

  window.location.href = youTubeAppUrl(videoId, webUrl)
}

/** iPhone, iPod, or an iPad — which reports itself as a Mac with a touchscreen. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
