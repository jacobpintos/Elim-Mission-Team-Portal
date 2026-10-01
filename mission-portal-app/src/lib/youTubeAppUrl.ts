/**
 * A video's address in the YouTube app itself, rather than on youtube.com.
 *
 * Opening the youtube.com address from a home-screen web app on an iPhone goes
 * through the browser iOS keeps inside the app: the page starts loading, iOS
 * hands it to the YouTube app, and the in-app browser is left behind on a
 * blank page — still there, over the portal, when you come back. The app's
 * own address goes straight to the app and never touches that browser.
 *
 * A start time on the original link is carried over, so a link to the bridge
 * still opens at the bridge.
 */
export function youTubeAppUrl(videoId: string, webUrl = ''): string {
  const start = webUrl.match(/[?&#](?:t|start)=([0-9hms]+)/)?.[1]
  const id = encodeURIComponent(videoId)
  return `youtube://www.youtube.com/watch?v=${id}${start ? `&t=${start}` : ''}`
}
