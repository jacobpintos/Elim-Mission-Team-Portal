import { describe, it, expect } from 'vitest'
import {
  clock,
  skipTarget,
  fractionAt,
  nextRate,
  rateLabel,
  loopStep,
  loopTarget,
} from './audioSeek'

describe('clock', () => {
  it('reads as m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(9.9)).toBe('0:09')
    expect(clock(95)).toBe('1:35')
    expect(clock(600)).toBe('10:00')
  })
  it('shows nonsense as zero rather than NaN:aN', () => {
    expect(clock(NaN)).toBe('0:00')
    expect(clock(-3)).toBe('0:00')
    expect(clock(Infinity)).toBe('0:00')
  })
})

describe('skipTarget', () => {
  it('goes back and forward ten seconds', () => {
    expect(skipTarget(60, 240, -10)).toBe(50)
    expect(skipTarget(60, 240, 10)).toBe(70)
  })
  it('stops at the start going back', () => {
    expect(skipTarget(4, 240, -10)).toBe(0)
  })
  it('stops just short of the end going forward, so play still plays', () => {
    expect(skipTarget(236, 240, 10)).toBe(239.5)
  })
  it('goes nowhere before the track knows how long it is', () => {
    expect(skipTarget(0, 0, 10)).toBe(0)
    expect(skipTarget(0, NaN, 10)).toBe(0)
  })
})

describe('fractionAt', () => {
  it('is how far along the bar the finger is', () => {
    expect(fractionAt(150, 100, 200)).toBe(0.25)
    expect(fractionAt(300, 100, 200)).toBe(1)
  })
  it('holds at the ends when a drag runs off the bar', () => {
    expect(fractionAt(40, 100, 200)).toBe(0)
    expect(fractionAt(900, 100, 200)).toBe(1)
  })
  it('is zero before the bar has been measured', () => {
    expect(fractionAt(150, 100, 0)).toBe(0)
  })
})

describe('nextRate', () => {
  it('steps down through three quarters and half, then back to full', () => {
    expect(nextRate(1)).toBe(0.75)
    expect(nextRate(0.75)).toBe(0.5)
    expect(nextRate(0.5)).toBe(1)
  })
  it('goes to the first step from a speed it does not know', () => {
    expect(nextRate(1.3)).toBe(1)
  })
  it('labels them as people say them', () => {
    expect(rateLabel(0.75)).toBe('0.75×')
    expect(rateLabel(1)).toBe('1×')
  })
})

describe('loopStep', () => {
  it('marks the start, then the end', () => {
    const a = loopStep(null, 30)
    expect(a).toEqual({ start: 30, end: null })
    expect(loopStep(a, 45)).toEqual({ start: 30, end: 45 })
  })
  it('takes the two points in either order', () => {
    expect(loopStep({ start: 45, end: null }, 30)).toEqual({ start: 30, end: 45 })
  })
  it('clears when pressed again on the same spot', () => {
    expect(loopStep({ start: 30, end: null }, 30.2)).toBeNull()
  })
  it('clears a running loop', () => {
    expect(loopStep({ start: 30, end: 45 }, 40)).toBeNull()
  })
})

describe('loopTarget', () => {
  const loop = { start: 30, end: 45 }
  it('sends the track back to the start on reaching the end', () => {
    expect(loopTarget(loop, 45)).toBe(30)
    expect(loopTarget(loop, 45.04)).toBe(30)
  })
  it('leaves it alone inside the loop', () => {
    expect(loopTarget(loop, 30)).toBeNull()
    expect(loopTarget(loop, 44.9)).toBeNull()
  })
  it('does nothing until the end is marked, or with no loop', () => {
    expect(loopTarget({ start: 30, end: null }, 90)).toBeNull()
    expect(loopTarget(null, 90)).toBeNull()
  })
})
