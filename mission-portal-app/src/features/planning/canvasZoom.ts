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

/**
 * Where the board is drawn, in window coordinates.
 *
 * The board sits inside the canvas area, which starts below the toolbar — a
 * toolbar that wraps to a second row on narrow screens and is absent entirely
 * in read-only mode, so this offset has to be measured, never assumed.
 */
export interface CanvasArea {
  x: number
  y: number
}

/**
 * Turn a point reported by a gesture into a point on the board.
 *
 * Gestures report where a touch landed in the window. Subtracting only the pan
 * offset and not the canvas area's own position puts everything placed by a
 * tap or a drag about a toolbar's height away from the finger — and further
 * off the further out you are zoomed, because the uncorrected gap is divided
 * by the scale along with everything else.
 *
 * Marked as a worklet so the gesture callbacks, which run on the UI thread,
 * can use this same implementation rather than a copy of it.
 */
export function windowToBoard(
  view: Viewport,
  area: CanvasArea,
  absX: number,
  absY: number
): { x: number; y: number } {
  'worklet'
  return {
    x: (absX - area.x - view.tx) / view.sc,
    y: (absY - area.y - view.ty) / view.sc,
  }
}

/** Where a board point currently sits in the window. The exact inverse. */
export function boardToWindow(
  view: Viewport,
  area: CanvasArea,
  x: number,
  y: number
): { x: number; y: number } {
  'worklet'
  return {
    x: x * view.sc + view.tx + area.x,
    y: y * view.sc + view.ty + area.y,
  }
}
