import { describe, it, expect } from 'vitest'
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  clampZoom,
  zoomAbout,
  windowToBoard,
  boardToWindow,
  type Viewport,
} from './canvasZoom'

/** The canvas area sits flush with the window unless a test says otherwise. */
const FLUSH = { x: 0, y: 0 }

/** A viewport 800 wide and 600 tall, so its middle is (400, 300). */
const CX = 400
const CY = 300

const view = (tx: number, ty: number, sc: number): Viewport => ({ tx, ty, sc })

describe('clampZoom', () => {
  it('leaves a sensible scale alone', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(2.5)).toBe(2.5)
  })

  it('holds the ends', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(50)).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(-3)).toBe(MIN_ZOOM)
  })

  it('refuses to produce a scale that would blank the board', () => {
    // NaN survives Math.min/Math.max, and a NaN scale turns every coordinate
    // into NaN — the board renders nothing at all with no way back.
    expect(clampZoom(NaN)).toBe(1)
  })

  it('pins a runaway value at the end rather than snapping back to 100%', () => {
    expect(clampZoom(Infinity)).toBe(MAX_ZOOM)
    expect(clampZoom(-Infinity)).toBe(MIN_ZOOM)
  })
})

describe('zoomAbout', () => {
  it('holds the anchor point on the same board content', () => {
    // The whole point: whatever is in the middle of the screen before the
    // zoom is still in the middle after it.
    const before = view(-100, -50, 1)
    const boardPointAtCentre = {
      x: (CX - before.tx) / before.sc,
      y: (CY - before.ty) / before.sc,
    }

    const after = zoomAbout(before, 2, CX, CY)
    const onScreen = boardToWindow(after, FLUSH, boardPointAtCentre.x, boardPointAtCentre.y)

    expect(onScreen.x).toBeCloseTo(CX, 6)
    expect(onScreen.y).toBeCloseTo(CY, 6)
  })

  it('holds the anchor when zooming out too', () => {
    const before = view(-1200, -900, 2)
    const boardPointAtCentre = {
      x: (CX - before.tx) / before.sc,
      y: (CY - before.ty) / before.sc,
    }

    const after = zoomAbout(before, 0.5, CX, CY)
    const onScreen = boardToWindow(after, FLUSH, boardPointAtCentre.x, boardPointAtCentre.y)

    expect(onScreen.x).toBeCloseTo(CX, 6)
    expect(onScreen.y).toBeCloseTo(CY, 6)
  })

  it('applies the requested scale', () => {
    expect(zoomAbout(view(0, 0, 1), 2, CX, CY).sc).toBe(2)
  })

  it('clamps, and anchors against the clamped value rather than the asked-for one', () => {
    // Asking for 100x and getting the translation for 100x while the scale
    // stopped at 4 would fling the board somewhere unrecoverable.
    const before = view(-100, -50, 1)
    const after = zoomAbout(before, 100, CX, CY)

    expect(after.sc).toBe(MAX_ZOOM)

    const boardPointAtCentre = { x: (CX - before.tx) / before.sc, y: (CY - before.ty) / before.sc }
    const onScreen = boardToWindow(after, FLUSH, boardPointAtCentre.x, boardPointAtCentre.y)
    expect(onScreen.x).toBeCloseTo(CX, 6)
    expect(onScreen.y).toBeCloseTo(CY, 6)
  })

  it('changes nothing when the scale does not change', () => {
    const before = view(-100, -50, 1)

    expect(zoomAbout(before, 1, CX, CY)).toEqual(before)
  })

  it('round-trips a step out and back', () => {
    // Pressing + then − should land where you started, not drift.
    const before = view(-137, -211, 1)

    const out = zoomAbout(before, before.sc * ZOOM_STEP, CX, CY)
    const back = zoomAbout(out, out.sc / ZOOM_STEP, CX, CY)

    expect(back.tx).toBeCloseTo(before.tx, 6)
    expect(back.ty).toBeCloseTo(before.ty, 6)
    expect(back.sc).toBeCloseTo(before.sc, 6)
  })

  it('anchors on a corner if that is what it is given', () => {
    // Not what the buttons do, but the anchor is a parameter and a zoom about
    // the origin must leave the origin alone.
    const after = zoomAbout(view(0, 0, 1), 2, 0, 0)

    expect(after.tx).toBe(0)
    expect(after.ty).toBe(0)
  })
})

describe('windowToBoard', () => {
  /** A toolbar two rows deep, which is what a narrow screen produces. */
  const BELOW_TOOLBAR = { x: 0, y: 118 }

  it('subtracts the canvas area offset', () => {
    // The bug this exists for: a touch at the very top of the canvas area is
    // at the top of the board, not 118px down it. Ignoring the offset put
    // everything placed by a tap a toolbar's height away from the finger.
    const at = windowToBoard(view(0, 0, 1), BELOW_TOOLBAR, 40, 118)

    expect(at).toEqual({ x: 40, y: 0 })
  })

  it('would be off by exactly the toolbar height without the offset', () => {
    // Pins the size of the error, so a regression is recognisable rather than
    // just "placement feels wrong".
    const withOffset = windowToBoard(view(0, 0, 1), BELOW_TOOLBAR, 40, 300)
    const withoutOffset = windowToBoard(view(0, 0, 1), FLUSH, 40, 300)

    expect(withoutOffset.y - withOffset.y).toBe(BELOW_TOOLBAR.y)
  })

  it('divides the offset by the scale like everything else', () => {
    // Why the error grew as you zoomed out: the uncorrected gap is in window
    // pixels, so at 25% it was four times as many board units.
    const at = windowToBoard(view(0, 0, 0.25), BELOW_TOOLBAR, 0, 118 + 50)

    expect(at.y).toBe(200)
  })

  it('accounts for the pan offset', () => {
    expect(windowToBoard(view(-500, -300, 1), BELOW_TOOLBAR, 40, 118)).toEqual({ x: 540, y: 300 })
  })

  it('accounts for pan, zoom and the area offset together', () => {
    const at = windowToBoard(view(-500, -300, 2), BELOW_TOOLBAR, 140, 218)

    expect(at).toEqual({ x: (140 + 500) / 2, y: (218 - 118 + 300) / 2 })
  })

  it('inverts boardToWindow exactly', () => {
    // The two are used against each other — a tap places an object, and the
    // object is drawn back where the tap was. Any disagreement shows up as the
    // thing you placed not being under your finger.
    const v = view(-137, -211, 1.75)
    const area = { x: 3, y: 118 }

    for (const [x, y] of [
      [0, 0],
      [2000, 2000],
      [-40, 3999],
    ]) {
      const win = boardToWindow(v, area, x, y)
      const back = windowToBoard(v, area, win.x, win.y)

      expect(back.x).toBeCloseTo(x, 6)
      expect(back.y).toBeCloseTo(y, 6)
    }
  })
})

describe('zoom bounds', () => {
  it('spans a useful range in whole steps', () => {
    expect(MIN_ZOOM).toBeLessThan(1)
    expect(MAX_ZOOM).toBeGreaterThan(1)
    expect(ZOOM_STEP).toBeGreaterThan(1)
  })

  it('reaches both ends from 100% in a reasonable number of presses', () => {
    // If the step were too fine the buttons would be unusable at the extremes.
    const pressesOut = Math.ceil(Math.log(1 / MIN_ZOOM) / Math.log(ZOOM_STEP))
    const pressesIn = Math.ceil(Math.log(MAX_ZOOM) / Math.log(ZOOM_STEP))

    expect(pressesOut).toBeLessThanOrEqual(10)
    expect(pressesIn).toBeLessThanOrEqual(10)
  })
})
