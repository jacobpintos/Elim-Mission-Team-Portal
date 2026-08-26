/**
 * Zoom and pan arithmetic for the full-screen image viewer.
 *
 * Kept out of the component because it runs inside gesture worklets, where
 * nothing can be logged or stepped through — an anchoring mistake there shows
 * up only as the picture lurching away from the fingers holding it.
 *
 * Every function here is pure and marked as a worklet at the call site rather
 * than here, so the same code can be unit tested on the JS thread.
 */

/** A picture fills the screen at 1; there is nothing to see below that. */
export const MIN_SCALE = 1

/** Past this a photo is mostly pixels. Also stops a runaway pinch. */
export const MAX_SCALE = 5

/** Where a double-tap zooms to, when it is not zooming back out. */
export const DOUBLE_TAP_SCALE = 2.5

export interface Point {
  x: number
  y: number
}

export function clampScale(scale: number): number {
  'worklet'
  // NaN survives Math.min and Math.max, and a NaN scale turns every derived
  // coordinate into NaN — the picture vanishes with no way back. An infinity
  // is different: it is out of range rather than unknown, so pin it.
  if (Number.isNaN(scale)) return MIN_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * How far the picture may be dragged before its edge comes inside the screen.
 *
 * Zero on an axis where the scaled picture is no bigger than the viewport —
 * there is no hidden content in that direction, so it should not move at all.
 */
export function panBounds(
  scale: number,
  content: { width: number; height: number },
  viewport: { width: number; height: number }
): Point {
  'worklet'
  const s = clampScale(scale)
  return {
    x: Math.max(0, (content.width * s - viewport.width) / 2),
    y: Math.max(0, (content.height * s - viewport.height) / 2),
  }
}

/** Keep a translation inside those bounds. */
export function clampPan(tx: number, ty: number, bounds: Point): Point {
  'worklet'
  const x = Number.isNaN(tx) ? 0 : Math.min(bounds.x, Math.max(-bounds.x, tx))
  const y = Number.isNaN(ty) ? 0 : Math.min(bounds.y, Math.max(-bounds.y, ty))
  return { x, y }
}

/**
 * Change the scale while holding one point on the screen still.
 *
 * Scaling alone pulls the picture towards its own centre, which throws
 * whatever was under the fingers off to one side. Correcting the translation
 * by the same ratio keeps the chosen point over the same part of the picture
 * before and after — the focal point of a pinch, or wherever a double-tap
 * landed.
 *
 * `focal` is measured from the centre of the viewport, which is also where
 * translation is measured from, so the two are already in the same frame.
 */
export function zoomAboutFocal(
  current: { scale: number; tx: number; ty: number },
  nextScale: number,
  focal: Point
): { scale: number; tx: number; ty: number } {
  'worklet'
  const scale = clampScale(nextScale)
  // A zero or absent previous scale would make the ratio meaningless; treat it
  // as a fresh start rather than propagating an infinity through the maths.
  const prev = current.scale > 0 ? current.scale : MIN_SCALE
  const ratio = scale / prev
  return {
    scale,
    tx: focal.x - (focal.x - current.tx) * ratio,
    ty: focal.y - (focal.y - current.ty) * ratio,
  }
}

/**
 * The size a picture is drawn at when fitted inside the screen whole.
 *
 * Matches resizeMode="contain": the picture is scaled until whichever edge
 * runs out first touches the viewport, and the other edge is letterboxed. Pan
 * bounds need this rather than the viewport, or dragging would wander into the
 * empty bars beside a picture that does not share the screen's proportions.
 *
 * Falls back to the viewport when the natural size is not known yet, which is
 * true for the moment between opening the viewer and the picture loading.
 */
export function containedSize(
  natural: { width?: number; height?: number } | null | undefined,
  viewport: { width: number; height: number }
): { width: number; height: number } {
  const w = natural?.width
  const h = natural?.height
  if (!w || !h || w <= 0 || h <= 0) return viewport
  if (viewport.width <= 0 || viewport.height <= 0) return viewport
  const ratio = Math.min(viewport.width / w, viewport.height / h)
  return { width: w * ratio, height: h * ratio }
}

/** What a double-tap should go to from here. */
export function nextDoubleTapScale(scale: number): number {
  'worklet'
  // Anything above "basically unzoomed" collapses back, so a second double-tap
  // always returns the whole picture rather than stepping up again.
  return scale > MIN_SCALE + 0.01 ? MIN_SCALE : DOUBLE_TAP_SCALE
}
