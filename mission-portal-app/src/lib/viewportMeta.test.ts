import { describe, it, expect } from 'vitest'
import { withViewportFitCover, withZoomReset, withoutZoomReset } from './viewportMeta'

describe('withViewportFitCover', () => {
  it("adds it to the app's own tag and keeps everything else", () => {
    expect(withViewportFitCover('width=device-width, initial-scale=1, shrink-to-fit=no')).toBe(
      'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover'
    )
  })

  it('replaces a viewport-fit that is already there instead of adding a second', () => {
    expect(withViewportFitCover('width=device-width, viewport-fit=auto')).toBe(
      'width=device-width, viewport-fit=cover'
    )
  })

  it('copes with odd spacing and an empty tag', () => {
    expect(withViewportFitCover('width=device-width ,initial-scale=1,')).toBe(
      'width=device-width, initial-scale=1, viewport-fit=cover'
    )
    expect(withViewportFitCover('')).toBe('viewport-fit=cover')
  })
})

describe('withZoomReset / withoutZoomReset', () => {
  const APP = 'width=device-width, initial-scale=1, shrink-to-fit=no'

  it('caps zoom at 100% for the moment it takes to zoom out, and lifts the cap after', () => {
    const capped = withZoomReset(APP)
    expect(capped).toBe(`${APP}, maximum-scale=1, user-scalable=no`)
    expect(withoutZoomReset(capped)).toBe(APP)
  })

  it('works alongside viewport-fit=cover, whichever comes first', () => {
    const covered = withViewportFitCover(APP)
    expect(withoutZoomReset(withZoomReset(covered))).toBe(covered)
    expect(withViewportFitCover(withoutZoomReset(withZoomReset(APP)))).toBe(covered)
  })

  it('does not add the cap twice', () => {
    expect(withZoomReset(withZoomReset(APP))).toBe(withZoomReset(APP))
  })
})
