import { describe, it, expect } from 'vitest'
import { formatWind, isWindNotable, NOTABLE_GUST_MPH } from './windFormat'

describe('formatWind', () => {
  it('says calm rather than printing a number nobody needs', () => {
    expect(formatWind(0, 0)).toBe('Calm')
    expect(formatWind(3, 6)).toBe('Calm')
  })

  it('reports steady wind on its own when gusts add nothing', () => {
    expect(formatWind(12, 14)).toBe('12 mph')
    expect(formatWind(12, 0)).toBe('12 mph')
  })

  it('names the gust when it is the number that matters', () => {
    // The case this is for: a steady breeze with gusts that take a tent down.
    expect(formatWind(12, 28)).toBe('12 mph, gusts 28')
  })

  it('does not call it calm when a still day is gusting hard', () => {
    expect(formatWind(4, 22)).toBe('4 mph, gusts 22')
  })

  it('rounds and survives missing readings', () => {
    expect(formatWind(11.6, 13.4)).toBe('12 mph')
    expect(formatWind(Number.NaN, Number.NaN)).toBe('Calm')
    expect(formatWind(-3, -3)).toBe('Calm')
  })

  it('names a gust exactly at the threshold', () => {
    // Rounding decides this one, so it is worth pinning: 12 and 19 are seven
    // apart, which is the gap at which the gust starts being the story.
    expect(formatWind(11.6, 19.2)).toBe('12 mph, gusts 19')
    expect(formatWind(12, 18)).toBe('12 mph')
  })
})

describe('isWindNotable', () => {
  it('flags gusts that outdoor set-up has to plan around', () => {
    expect(isWindNotable(10, NOTABLE_GUST_MPH)).toBe(true)
    expect(isWindNotable(22, 24)).toBe(true)
  })

  it('leaves an ordinary breezy day alone', () => {
    expect(isWindNotable(9, 15)).toBe(false)
    expect(isWindNotable(0, 0)).toBe(false)
  })
})
