/**
 * Whether a video may start by itself, with its sound, in this browser.
 *
 * Not on an iPhone or iPad — every browser there is Safari underneath, and
 * Safari only lets a video start with sound straight from a tap. A YouTube
 * player asked to start by itself there (autoplay=1) is refused, and it can
 * sit on its loading spinner a long while before it shows its play button:
 * the half a minute between Miriam opening a video and it being ready to
 * play. Asked not to, it comes up ready, waiting for the tap it needs anyway.
 *
 * An iPad asking for the desktop site says it is a Mac; a Mac has no touch
 * screen, so one with touch points is an iPad.
 */
export function startsWithSound(
  nav: { userAgent?: string; platform?: string; maxTouchPoints?: number } | undefined
): boolean {
  if (!nav) return true
  if (/\b(?:iPhone|iPad|iPod)\b/.test(nav.userAgent ?? '')) return false
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return false
  return true
}

/** YouTube's embedded player for a video, as the web app shows it. */
export function youTubeEmbedUrl(id: string, autoplay: boolean): string {
  // playsinline: in the app's own player on an iPhone, not handed to the
  // phone's full-screen one. rel=0: what follows is from the same channel.
  return `https://www.youtube.com/embed/${id}?${autoplay ? 'autoplay=1&' : ''}playsinline=1&rel=0`
}
