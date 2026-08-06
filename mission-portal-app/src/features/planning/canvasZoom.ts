/**
 * Zoom arithmetic for the planning board.
 *
 * Kept out of the component because it runs against shared values inside
 * gesture and button callbacks, where nothing can be observed — getting the
 * anchoring backwards there shows up only as the board lurching away from
 * whatever you were looking at.
 */

/**
 * How far the board can be zoomed.
 *
 * Below 20% a 4000px board is a smear; above 400% the objects are larger than
 * the screen. The buttons and pinch share these so the two cannot disagree.
 */
export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 4

/** What one press of + or − does. Roughly three presses to halve or double. */
export const ZOOM_STEP = 1.25

export interface Viewport {
  /** Board translation, in screen pixels, relative to the canvas area. */
  tx: number
  ty: number
  /** Current scale. */
  sc: number
}

export function clampZoom(scale: number): number {
  // NaN survives Math.min and Math.max, and a NaN scale multiplies every
  // coordinate on the board into NaN — the canvas simply goes blank with no
  // way back. A runaway large value is different: pin it at the top rather
  // than snapping the board back to actual size under the user.
  if (Number.isNaN(scale)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

/**
 * Change the scale while holding one screen point still.
 *
 * Scaling on its own pulls the board towards its own origin, which throws
 * whatever was in the middle of the screen off the edge. Correcting the
 * translation by the same ratio keeps the chosen point — the middle of the
 * viewport, for the zoom buttons — under exactly the same board content
 * before and after.
 */
export function zoomAbout(view: Viewport, nextScale: number, cx: number, cy: number): Viewport {
  const sc = clampZoom(nextScale)
  const ratio = sc / view.sc
  return {
    tx: cx - (cx - view.tx) * ratio,
    ty: cy - (cy - view.ty) * ratio,
    sc,
  }
}

/** Where a board point currently sits on screen. */
export function boardToScreen(view: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * view.sc + view.tx, y: y * view.sc + view.ty }
}
