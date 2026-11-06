import type { MultiviewFeed } from './switcherAddress'

/**
 * The ATEM's multiview, the same picture as the monitor plugged into it, in
 * the app: its multiview output goes into a video encoder on the same
 * network, and the app shows what the encoder serves there. Not over the
 * internet, and not from the ATEM itself: its network connection carries
 * no video.
 *
 * Two kinds of encoder preview are shown:
 * - a still picture the encoder keeps updating, asked for again as soon as
 *   each one arrives (the next shown only once it has loaded, so it never
 *   flickers);
 * - a motion-JPEG stream, which the page shows as it comes.
 */

/** A feed address as typed: an http(s) address, or null if it isn't one. */
export function feedUrlOf(typed: string): string | null {
  const t = typed.trim()
  if (!t) return null
  const withScheme = /^[a-z]+:\/\//i.test(t) ? t : `http://${t}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** The page that shows the feed, filling its frame, black around it. */
export function multiviewHtml(feed: MultiviewFeed): string {
  // As a script string, with "<" escaped so the address can't end the script.
  const url = JSON.stringify(feed.url).replace(/</g, '\\u003c')
  const still = `
    var shown = document.getElementById('v'), next = new Image(), wait = 150;
    function load() {
      next.src = ${url} + (${url}.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    }
    next.onload = function () { shown.src = next.src; wait = 150; setTimeout(load, wait); };
    next.onerror = function () { wait = Math.min(wait * 2, 3000); setTimeout(load, wait); };
    load();`
  const mjpeg = `document.getElementById('v').src = ${url};`
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}img{width:100%;height:100%;object-fit:contain;display:block}</style>
</head><body><img id="v" alt=""><script>${feed.kind === 'mjpeg' ? mjpeg : still}</script></body></html>`
}
