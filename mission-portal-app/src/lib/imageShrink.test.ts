import { describe, it, expect } from 'vitest'
import { fitWithin, MAX_EDGE } from './imageShrink'

describe('fitWithin', () => {
  it('shrinks a photo by its longest edge', () => {
    // A 12MP phone photo, which is what actually gets picked.
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('leaves anything already small enough alone', () => {
    // Never upscale: enlarging a small image costs bytes and gains nothing.
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
  })

  it('keeps a sliver of an image from rounding away to nothing', () => {
    expect(fitWithin(8000, 3, MAX_EDGE)).toEqual({ width: 1600, height: 1 })
  })

  it('survives a picture with no dimensions', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})
