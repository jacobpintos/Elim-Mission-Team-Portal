import { describe, it, expect } from 'vitest'
import { clock, skipTarget, fractionAt } from './audioSeek'

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
