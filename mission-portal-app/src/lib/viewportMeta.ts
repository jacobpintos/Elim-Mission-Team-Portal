/**
 * The viewport tag's content with viewport-fit=cover in it.
 *
 * Kept apart from the hook that applies it so the string handling can be
 * tested without a DOM. Any viewport-fit already present is replaced rather
 * than duplicated, and everything else in the tag is left exactly as it was.
 */
export function withViewportFitCover(content: string): string {
  const parts = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^viewport-fit\s*=/i.test(p))
  return [...parts, 'viewport-fit=cover'].join(', ')
}

/**
 * The viewport tag with zooming capped at 100%, which a browser answers by
 * zooming the page back out to 100%: there is no call that sets a page's zoom,
 * so this is how one is reset. user-scalable=no as well, for an iPhone that
 * would otherwise let the cap be overridden. Lifted again by withoutZoomReset
 * moments later, so pinching to zoom works as before.
 */
const ZOOM_RESET = ['maximum-scale=1', 'user-scalable=no']
const isZoomPart = (p: string) => /^(maximum-scale|user-scalable)\s*=/i.test(p)

export function withZoomReset(content: string): string {
  const parts = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !isZoomPart(p))
  return [...parts, ...ZOOM_RESET].join(', ')
}

/** The tag with the cap lifted, everything else as it is now. */
export function withoutZoomReset(content: string): string {
  return content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !isZoomPart(p))
    .join(', ')
}
