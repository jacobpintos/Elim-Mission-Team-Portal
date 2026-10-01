import { describe, it, expect } from 'vitest'
import { withViewportFitCover } from './viewportMeta'

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
