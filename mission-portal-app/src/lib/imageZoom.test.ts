import { describe, it, expect } from 'vitest'
import {
  clampScale,
  panBounds,
  clampPan,
  zoomAboutFocal,
  containedSize,
  nextDoubleTapScale,
  MIN_SCALE,
  MAX_SCALE,
  DOUBLE_TAP_SCALE,
} from './imageZoom'

const VIEW = { width: 400, height: 800 }

describe('clampScale', () => {
  it('leaves a sensible scale alone', () => {
    expect(clampScale(2.5)).toBe(2.5)
  })

  it('will not zoom out past the whole picture', () => {
    expect(clampScale(0.4)).toBe(MIN_SCALE)
    expect(clampScale(-3)).toBe(MIN_SCALE)
  })

  it('stops a runaway pinch', () => {
    expect(clampScale(50)).toBe(MAX_SCALE)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE)
  })

  it('falls back on NaN rather than blanking the picture', () => {
    // A NaN scale turns every derived coordinate into NaN and the image
    // disappears with no gesture able to bring it back.
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE)
  })
})

describe('panBounds', () => {
  it('allows no movement when the picture fits', () => {
    // Nothing is hidden, so dragging should do nothing at all.
    expect(panBounds(1, VIEW, VIEW)).toEqual({ x: 0, y: 0 })
  })

  it('allows exactly the hidden half in each direction', () => {
    // At 2x, a 400-wide picture is 800 wide in a 400 viewport: 200 hidden
    // each side.
    expect(panBounds(2, VIEW, VIEW)).toEqual({ x: 200, y: 400 })
  })

  it('locks an axis where the picture is still smaller than the screen', () => {
    // A wide, short picture letterboxed top and bottom: zooming it lets you
    // pan sideways long before there is anything hidden vertically.
    const content = { width: 400, height: 200 }
    expect(panBounds(1.5, content, VIEW)).toEqual({ x: 100, y: 0 })
  })

  it('clamps the scale before measuring', () => {
    expect(panBounds(0.1, VIEW, VIEW)).toEqual({ x: 0, y: 0 })
  })
})

describe('clampPan', () => {
  const bounds = { x: 200, y: 400 }

  it('leaves a translation inside the bounds alone', () => {
    expect(clampPan(50, -100, bounds)).toEqual({ x: 50, y: -100 })
  })

  it('stops the picture being dragged off the screen', () => {
    expect(clampPan(999, -999, bounds)).toEqual({ x: 200, y: -400 })
  })

  it('pins to centre when there is nowhere to go', () => {
    expect(clampPan(80, 80, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('recovers from NaN instead of losing the picture', () => {
    expect(clampPan(Number.NaN, Number.NaN, bounds)).toEqual({ x: 0, y: 0 })
  })
})

describe('zoomAboutFocal', () => {
  it('holds the centre still when the focal point is the centre', () => {
    const next = zoomAboutFocal({ scale: 1, tx: 0, ty: 0 }, 2, { x: 0, y: 0 })
    expect(next).toEqual({ scale: 2, tx: 0, ty: 0 })
  })

  it('keeps the point under the fingers over the same part of the picture', () => {
    // Pinching centred 100px right of the middle: at 2x that content would
    // otherwise slide to 200px, so the translation has to pull back by 100.
    const next = zoomAboutFocal({ scale: 1, tx: 0, ty: 0 }, 2, { x: 100, y: 0 })
    expect(next.scale).toBe(2)
    expect(next.tx).toBe(-100)
  })

  it('reverses exactly on the way back out', () => {
    const inA = zoomAboutFocal({ scale: 1, tx: 0, ty: 0 }, 2, { x: 100, y: 50 })
    const back = zoomAboutFocal(inA, 1, { x: 100, y: 50 })
    expect(back.scale).toBe(1)
    expect(back.tx).toBeCloseTo(0)
    expect(back.ty).toBeCloseTo(0)
  })

  it('clamps the resulting scale', () => {
    expect(zoomAboutFocal({ scale: 1, tx: 0, ty: 0 }, 99, { x: 0, y: 0 }).scale).toBe(MAX_SCALE)
  })

  it('treats a zero previous scale as a fresh start', () => {
    // Would otherwise divide by zero and send the translation to infinity.
    const next = zoomAboutFocal({ scale: 0, tx: 10, ty: 10 }, 2, { x: 0, y: 0 })
    expect(Number.isFinite(next.tx)).toBe(true)
    expect(Number.isFinite(next.ty)).toBe(true)
  })
})

describe('containedSize', () => {
  it('fits a wide picture to the width and letterboxes it', () => {
    // 1600x900 in a 400x800 viewport fits on width: 400x225.
    expect(containedSize({ width: 1600, height: 900 }, VIEW)).toEqual({ width: 400, height: 225 })
  })

  it('fits a tall picture to the height', () => {
    // 900x1600 in 400x800 fits on height: 450x800 would overflow width, so
    // width wins at 400x711 — whichever edge runs out first.
    const out = containedSize({ width: 900, height: 1600 }, VIEW)
    expect(out.width).toBeCloseTo(400)
    expect(out.height).toBeCloseTo(711.1, 0)
  })

  it('falls back to the viewport before the picture has loaded', () => {
    expect(containedSize(null, VIEW)).toEqual(VIEW)
    expect(containedSize({}, VIEW)).toEqual(VIEW)
    expect(containedSize({ width: 0, height: 100 }, VIEW)).toEqual(VIEW)
  })
})

describe('nextDoubleTapScale', () => {
  it('zooms in from unzoomed', () => {
    expect(nextDoubleTapScale(MIN_SCALE)).toBe(DOUBLE_TAP_SCALE)
  })

  it('collapses back from anywhere zoomed', () => {
    // Any zoom at all returns the whole picture, rather than stepping up
    // again and stranding someone mid-zoom.
    expect(nextDoubleTapScale(1.5)).toBe(MIN_SCALE)
    expect(nextDoubleTapScale(DOUBLE_TAP_SCALE)).toBe(MIN_SCALE)
    expect(nextDoubleTapScale(MAX_SCALE)).toBe(MIN_SCALE)
  })
})
