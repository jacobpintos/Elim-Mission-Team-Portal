import { describe, it, expect } from 'vitest'
import { luminance, autoTextColor, contrastRatio } from './contrast'

describe('luminance', () => {
  it('anchors black and white at the ends of the scale', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('weights green above red above blue', () => {
    // WCAG's coefficients, which is what keeps autoTextColor sensible on
    // saturated brand colours.
    expect(luminance('#00ff00')).toBeGreaterThan(luminance('#ff0000'))
    expect(luminance('#ff0000')).toBeGreaterThan(luminance('#0000ff'))
  })
})

describe('autoTextColor', () => {
  it('puts dark text on light backgrounds and light text on dark', () => {
    expect(autoTextColor('#ffffff')).toBe('#1a1a2e')
    expect(autoTextColor('#000000')).toBe('#ffffff')
  })

  it('clears WCAG AA on the default primary', () => {
    // #f56c5a is the shipped default, and it sits in the band where a
    // luminance > 0.5 threshold chose white text at 2.93:1.
    expect(contrastRatio('#f56c5a', autoTextColor('#f56c5a'))).toBeGreaterThanOrEqual(4.5)
  })

  it('picks readable text for a saturated brand colour', () => {
    // Admins can set an arbitrary primary; whatever comes back has to be the
    // more readable of the two options.
    for (const bg of ['#f56c5a', '#2980b9', '#27ae60', '#8e44ad', '#e67e22']) {
      const chosen = autoTextColor(bg)
      const other = chosen === '#ffffff' ? '#1a1a2e' : '#ffffff'
      expect(contrastRatio(bg, chosen)).toBeGreaterThanOrEqual(contrastRatio(bg, other))
    }
  })
})

describe('contrastRatio', () => {
  it('reports 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('reports 1:1 for a colour against itself', () => {
    expect(contrastRatio('#3a7bd5', '#3a7bd5')).toBeCloseTo(1, 5)
  })

  it('does not depend on argument order', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 10)
  })
})
