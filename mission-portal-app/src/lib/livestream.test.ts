import { describe, it, expect } from 'vitest'
import {
  expiryFrom,
  isLive,
  activeStream,
  msUntilExpiry,
  expiredStreams,
  DEFAULT_STREAM_HOURS,
  MAX_STREAM_HOURS,
  type Livestream,
} from './livestream'

const HOUR = 60 * 60 * 1000
const NOON = new Date('2026-09-13T12:00:00Z').getTime()

function stream(over: Partial<Livestream> = {}): Livestream {
  return {
    id: 's1',
    title: 'Sunday Service',
    youtubeUrl: 'https://www.youtube.com/live/4xzDTAGJ1bY',
    createdAt: NOON,
    expiresAt: NOON + DEFAULT_STREAM_HOURS * HOUR,
    ...over,
  }
}

describe('expiryFrom', () => {
  it('stands for six hours by default', () => {
    expect(expiryFrom(NOON)).toBe(NOON + 6 * HOUR)
  })

  it('accepts a longer window for a service that runs over', () => {
    expect(expiryFrom(NOON, 8)).toBe(NOON + 8 * HOUR)
  })

  it('clamps a window longer than a day', () => {
    expect(expiryFrom(NOON, 1000)).toBe(NOON + MAX_STREAM_HOURS * HOUR)
  })

  it('clamps a zero or negative window to an hour', () => {
    expect(expiryFrom(NOON, 0)).toBe(NOON + HOUR)
    expect(expiryFrom(NOON, -5)).toBe(NOON + HOUR)
  })
})

describe('isLive', () => {
  it('is live inside its window', () => {
    expect(isLive(stream(), NOON + HOUR)).toBe(true)
  })

  it('is down once the window has passed', () => {
    expect(isLive(stream(), NOON + 7 * HOUR)).toBe(false)
  })

  it('is down at the exact moment it expires', () => {
    expect(isLive(stream(), NOON + 6 * HOUR)).toBe(false)
  })
})

describe('activeStream', () => {
  it('finds nothing when there are no cards', () => {
    expect(activeStream([], NOON)).toBeNull()
  })

  it('finds nothing when every card has expired', () => {
    const old = stream({ createdAt: NOON - 24 * HOUR, expiresAt: NOON - 18 * HOUR })
    expect(activeStream([old], NOON)).toBeNull()
  })

  it('finds the one live card', () => {
    const old = stream({ id: 'old', createdAt: NOON - 24 * HOUR, expiresAt: NOON - 18 * HOUR })
    const live = stream({ id: 'live' })
    expect(activeStream([old, live], NOON + HOUR)?.id).toBe('live')
  })

  it('prefers the newest card when two are live at once', () => {
    const first = stream({ id: 'first', createdAt: NOON })
    const correction = stream({ id: 'correction', createdAt: NOON + 5 * 60 * 1000 })
    expect(activeStream([first, correction], NOON + HOUR)?.id).toBe('correction')
  })

  it('does not care what order the cards arrive in', () => {
    const first = stream({ id: 'first', createdAt: NOON })
    const correction = stream({ id: 'correction', createdAt: NOON + 5 * 60 * 1000 })
    expect(activeStream([correction, first], NOON + HOUR)?.id).toBe('correction')
  })
})

describe('msUntilExpiry', () => {
  it('counts down to the end of the window', () => {
    expect(msUntilExpiry(stream(), NOON + 2 * HOUR)).toBe(4 * HOUR)
  })

  it('never goes negative once the window has passed', () => {
    expect(msUntilExpiry(stream(), NOON + 100 * HOUR)).toBe(0)
  })
})

describe('expiredStreams', () => {
  it('picks out only the cards whose window has passed', () => {
    const old = stream({ id: 'old', expiresAt: NOON - HOUR })
    const live = stream({ id: 'live' })
    expect(expiredStreams([old, live], NOON + HOUR).map((s) => s.id)).toEqual(['old'])
  })
})
