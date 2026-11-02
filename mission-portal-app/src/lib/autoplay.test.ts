import { describe, it, expect } from 'vitest'
import { startsWithSound, youTubeEmbedUrl } from './autoplay'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('startsWithSound', () => {
  it('never on an iPhone or iPad, in whatever browser', () => {
    expect(startsWithSound({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(
      false
    )
    expect(
      startsWithSound({ userAgent: CHROME_IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    ).toBe(false)
    // An iPad asking for the desktop site: a "Mac" with a touch screen.
    expect(
      startsWithSound({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 })
    ).toBe(false)
  })

  it('elsewhere, as before', () => {
    expect(
      startsWithSound({ userAgent: MAC_CHROME, platform: 'MacIntel', maxTouchPoints: 0 })
    ).toBe(true)
    expect(
      startsWithSound({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 })
    ).toBe(true)
    expect(startsWithSound(undefined)).toBe(true)
  })
})

describe('youTubeEmbedUrl', () => {
  it('starts by itself only where it may, and always plays inside the app', () => {
    expect(youTubeEmbedUrl('abc', true)).toBe(
      'https://www.youtube.com/embed/abc?autoplay=1&playsinline=1&rel=0'
    )
    expect(youTubeEmbedUrl('abc', false)).toBe(
      'https://www.youtube.com/embed/abc?playsinline=1&rel=0'
    )
  })
})
