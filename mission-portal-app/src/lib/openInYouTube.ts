import { openExternalUrl } from '@/lib/externalUrl'

/**
 * Open a YouTube video in the YouTube app.
 *
 * Native already does the right thing with the ordinary link: iOS and
 * Android hand a youtube.com address straight to the app. The web build of
 * this file is where the iPhone needs something else.
 */
export function openInYouTube(webUrl: string, _videoId: string | null): void {
  void openExternalUrl(webUrl)
}
