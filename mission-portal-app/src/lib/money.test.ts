import { describe, it, expect } from 'vitest'
import { parseDollars, formatCents } from './money'

describe('parseDollars', () => {
  it('reads amounts the way people type them', () => {
    expect(parseDollars('12')).toBe(1200)
    expect(parseDollars('12.5')).toBe(1250)
    expect(parseDollars('12.05')).toBe(1205)
    expect(parseDollars('$1,204.99')).toBe(120499)
    expect(parseDollars('.5')).toBe(50)
    expect(parseDollars(' 3.10 ')).toBe(310)
  })

  it('refuses what is not an amount', () => {
    expect(parseDollars('')).toBeNull()
    expect(parseDollars('abc')).toBeNull()
    expect(parseDollars('1.234')).toBeNull()
    expect(parseDollars('-5')).toBeNull()
    expect(parseDollars('1.2.3')).toBeNull()
  })

  it('adds exactly, which floating-point dollars would not', () => {
    expect((parseDollars('0.1') ?? 0) + (parseDollars('0.2') ?? 0)).toBe(30)
  })
})

describe('formatCents', () => {
  it('writes dollars and cents', () => {
    expect(formatCents(1540)).toBe('$15.40')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(7)).toBe('$0.07')
  })
})
