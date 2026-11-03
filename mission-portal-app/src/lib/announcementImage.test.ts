import { describe, it, expect } from 'vitest'
import {
  naturalHeight,
  clampImageHeight,
  cardImageHeight,
  isCropped,
  isExpired,
  notExpired,
  MIN_IMAGE_HEIGHT,
  MAX_IMAGE_HEIGHT,
  FALLBACK_IMAGE_HEIGHT,
  cardVideoHeight,
  durationSaid,
  MIN_VIDEO_HEIGHT,
  MAX_VIDEO_HEIGHT,
  sizeSaid,
  videoType,
} from './announcementImage'

describe('naturalHeight', () => {
  it('keeps the photo’s proportions at the card width', () => {
    // 1600×900 in a 400-wide card is 225 tall.
    expect(naturalHeight({ width: 1600, height: 900 }, 400)).toBe(225)
    // A square stays square.
    expect(naturalHeight({ width: 500, height: 500 }, 400)).toBe(400)
    // Taller than wide is allowed; the clamp deals with it later.
    expect(naturalHeight({ width: 900, height: 1600 }, 450)).toBe(800)
  })

  it('gives up rather than guessing when the size is unknown', () => {
    expect(naturalHeight(null, 400)).toBeNull()
    expect(naturalHeight(undefined, 400)).toBeNull()
    expect(naturalHeight({}, 400)).toBeNull()
    expect(naturalHeight({ width: 100 }, 400)).toBeNull()
    expect(naturalHeight({ height: 100 }, 400)).toBeNull()
  })

  it('gives up on sizes that cannot be laid out', () => {
    // A zero width would divide by zero and lay out a NaN-tall box.
    expect(naturalHeight({ width: 0, height: 100 }, 400)).toBeNull()
    expect(naturalHeight({ width: 100, height: 0 }, 400)).toBeNull()
    expect(naturalHeight({ width: -100, height: 100 }, 400)).toBeNull()
    expect(naturalHeight({ width: 100, height: 100 }, 0)).toBeNull()
    expect(naturalHeight({ width: 100, height: 100 }, Number.NaN)).toBeNull()
  })
})

describe('clampImageHeight', () => {
  it('leaves a sensible height alone', () => {
    expect(clampImageHeight(225)).toBe(225)
  })

  it('will not draw a stripe or push the text off screen', () => {
    expect(clampImageHeight(10)).toBe(MIN_IMAGE_HEIGHT)
    expect(clampImageHeight(5000)).toBe(MAX_IMAGE_HEIGHT)
  })

  it('rounds, since a fractional pixel height is not a thing', () => {
    expect(clampImageHeight(224.6)).toBe(225)
  })

  it('falls back rather than laying out NaN', () => {
    expect(clampImageHeight(Number.NaN)).toBe(FALLBACK_IMAGE_HEIGHT)
    expect(clampImageHeight(Number.POSITIVE_INFINITY)).toBe(MAX_IMAGE_HEIGHT)
  })
})

describe('cardImageHeight', () => {
  it('uses the photo’s own proportions when nothing is overridden', () => {
    expect(cardImageHeight({ width: 1600, height: 900 }, 400)).toBe(225)
  })

  it('prefers the height the admin chose', () => {
    expect(cardImageHeight({ width: 1600, height: 900, displayHeight: 320 }, 400)).toBe(320)
  })

  it('clamps a stored height that would break the layout', () => {
    // From an older build, or edited by hand in the console.
    expect(cardImageHeight({ width: 1600, height: 900, displayHeight: 9999 }, 400)).toBe(
      MAX_IMAGE_HEIGHT
    )
    expect(cardImageHeight({ width: 1600, height: 900, displayHeight: 1 }, 400)).toBe(
      MIN_IMAGE_HEIGHT
    )
  })

  it('falls back when there is no attachment or no known size', () => {
    expect(cardImageHeight(null, 400)).toBe(FALLBACK_IMAGE_HEIGHT)
    expect(cardImageHeight({}, 400)).toBe(FALLBACK_IMAGE_HEIGHT)
  })
})

describe('isCropped', () => {
  it('is false when the photo is shown at its own proportions', () => {
    expect(isCropped({ width: 1600, height: 900 }, 400)).toBe(false)
    expect(isCropped({ width: 1600, height: 900, displayHeight: 225 }, 400)).toBe(false)
  })

  it('is true once the admin picks a different height', () => {
    // The alternative to cropping is distorting, which is never offered — so
    // this is what the composer warns about.
    expect(isCropped({ width: 1600, height: 900, displayHeight: 320 }, 400)).toBe(true)
  })

  it('says nothing when the natural size is unknown', () => {
    expect(isCropped({ displayHeight: 320 }, 400)).toBe(false)
    expect(isCropped(null, 400)).toBe(false)
  })
})

describe('isExpired', () => {
  it('keeps an announcement all through the day it expires', () => {
    // "Deleted after that day passes" — a notice that vanished on the morning
    // of the day it names would be the opposite of useful.
    expect(isExpired('2026-08-26', '2026-08-26')).toBe(false)
  })

  it('expires it the next day', () => {
    expect(isExpired('2026-08-26', '2026-08-27')).toBe(true)
  })

  it('is not expired before the date', () => {
    expect(isExpired('2026-08-26', '2026-08-25')).toBe(false)
  })

  it('treats no date as never expiring', () => {
    expect(isExpired(undefined, '2026-08-26')).toBe(false)
    expect(isExpired(null, '2026-08-26')).toBe(false)
    expect(isExpired('', '2026-08-26')).toBe(false)
  })

  it('compares across months and years correctly', () => {
    // YYYY-MM-DD sorts lexicographically, which is why it is stored this way.
    expect(isExpired('2026-08-31', '2026-09-01')).toBe(true)
    expect(isExpired('2026-12-31', '2027-01-01')).toBe(true)
    expect(isExpired('2027-01-01', '2026-12-31')).toBe(false)
  })
})

describe('notExpired', () => {
  it('drops only what has outlived its date', () => {
    const items = [
      { id: 'a', expiresAt: '2026-08-25' },
      { id: 'b', expiresAt: '2026-08-26' },
      { id: 'c', expiresAt: '2026-08-27' },
      { id: 'd' },
    ]
    expect(notExpired(items, '2026-08-26').map((i) => i.id)).toEqual(['b', 'c', 'd'])
  })

  it('leaves a list with no dates untouched', () => {
    const items: { id: string; expiresAt?: string }[] = [{ id: 'a' }, { id: 'b' }]
    expect(notExpired(items, '2026-08-26')).toHaveLength(2)
  })
})

describe('a video in a card', () => {
  it('at its own proportions, whole — between the bounds', () => {
    expect(cardVideoHeight({ width: 1280, height: 720 }, 600)).toBe(338)
    // A phone held upright: as tall as a card allows, shown whole on black.
    expect(cardVideoHeight({ width: 720, height: 1280 }, 600)).toBe(MAX_VIDEO_HEIGHT)
    // A very wide one: never a sliver.
    expect(cardVideoHeight({ width: 3000, height: 400 }, 360)).toBe(MIN_VIDEO_HEIGHT)
    // Its size not known: 16:9.
    expect(cardVideoHeight(null, 640)).toBe(360)
    expect(cardVideoHeight({}, 0)).toBe(MIN_VIDEO_HEIGHT)
  })

  it('its length and size, said', () => {
    expect(durationSaid(42)).toBe('0:42')
    expect(durationSaid(725)).toBe('12:05')
    expect(durationSaid(3730)).toBe('1:02:10')
    expect(sizeSaid(23.4 * 1024 * 1024)).toBe('23 MB')
    expect(sizeSaid(640 * 1024)).toBe('640 KB')
  })

  it('stored as the video it is, whatever the picker said', () => {
    expect(videoType('video/quicktime', 'IMG_1.MOV')).toBe('video/quicktime')
    expect(videoType(null, 'IMG_1.MOV')).toBe('video/quicktime')
    expect(videoType('', 'clip.webm')).toBe('video/webm')
    expect(videoType(undefined, undefined)).toBe('video/mp4')
    expect(videoType('application/octet-stream', 'clip.mp4')).toBe('video/mp4')
  })
})
