import { describe, it, expect } from 'vitest'
import {
  advance,
  clampLevel,
  DEFAULT_LEVEL,
  isTap,
  MAX_LEVEL,
  parseSpeeds,
  pointsPerSecond,
  SCROLL_SPEEDS,
  speedFor,
  withSpeed,
} from './autoScroll'

describe('speeds', () => {
  it('go up with every step', () => {
    for (let i = 1; i < SCROLL_SPEEDS.length; i++) {
      expect(SCROLL_SPEEDS[i]).toBeGreaterThan(SCROLL_SPEEDS[i - 1])
    }
  })

  it('carry a 2,500-point sheet through in a song’s length at the middle speeds', () => {
    const minutes = (level: number) => 2500 / pointsPerSecond(level, 1) / 60
    expect(minutes(5)).toBeGreaterThan(4)
    expect(minutes(7)).toBeLessThan(4)
    expect(minutes(7)).toBeGreaterThan(3)
  })

  it('scale with the text: bigger text is a taller sheet', () => {
    expect(pointsPerSecond(5, 1.5)).toBeCloseTo(pointsPerSecond(5, 1) * 1.5)
  })

  it('keep to the range', () => {
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(99)).toBe(MAX_LEVEL)
    expect(clampLevel(NaN)).toBe(DEFAULT_LEVEL)
    expect(clampLevel(4.6)).toBe(5)
  })
})

describe('advance', () => {
  it('moves by speed × time', () => {
    expect(advance(100, 5, 1, 0.05, 1000)).toEqual({ y: 100.4, done: false })
  })

  it('does not leap ahead after a stall', () => {
    expect(advance(100, 5, 1, 30, 1000).y).toBeCloseTo(100.8)
  })

  it('stops at the end, and says so', () => {
    expect(advance(999.9, 12, 1, 0.1, 1000)).toEqual({ y: 1000, done: true })
  })

  it('a sheet shorter than the screen is done at once', () => {
    expect(advance(0, 5, 1, 0.016, -50)).toEqual({ y: 0, done: true })
  })

  it('keeps moving at the slowest speed, a fraction of a point a frame', () => {
    let y = 0
    for (let i = 0; i < 60; i++) y = advance(y, 1, 0.85, 1 / 60, 1000).y
    expect(y).toBeCloseTo(3 * 0.85)
  })
})

describe('isTap', () => {
  it('a quick touch that hardly moved is a tap', () => {
    expect(isTap(3, 120)).toBe(true)
  })
  it('a drag, or a long press, is not', () => {
    expect(isTap(40, 120)).toBe(false)
    expect(isTap(2, 800)).toBe(false)
  })
})

describe('saved speeds', () => {
  it('start at the default with nothing saved, or something unreadable', () => {
    expect(parseSpeeds(null)).toEqual({ last: DEFAULT_LEVEL, bySheet: {} })
    expect(parseSpeeds('not json')).toEqual({ last: DEFAULT_LEVEL, bySheet: {} })
  })

  it('a song keeps its own speed; a new song starts at the last one used', () => {
    let saved = parseSpeeds(null)
    saved = withSpeed(saved, 'holy-forever', 3)
    saved = withSpeed(saved, 'way-maker', 8)
    expect(speedFor(saved, 'holy-forever')).toBe(3)
    expect(speedFor(saved, 'way-maker')).toBe(8)
    expect(speedFor(saved, 'new-song')).toBe(8)
  })

  it('survive being kept as text, and clamp anything out of range', () => {
    const saved = withSpeed(parseSpeeds(null), 'a', 4)
    expect(parseSpeeds(JSON.stringify(saved))).toEqual(saved)
    expect(parseSpeeds('{"last":40,"bySheet":{"a":-3,"b":"x"}}')).toEqual({
      last: MAX_LEVEL,
      bySheet: { a: 1 },
    })
  })
})
