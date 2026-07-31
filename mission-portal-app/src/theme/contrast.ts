// WCAG 2.1 relative luminance
function srgbToLinear(c: number): number {
  c = c / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#1a1a2e'

/**
 * Pick whichever of the two text colours is more readable on `bg`.
 *
 * This used to branch on `luminance(bg) > 0.5`, but contrast is not linear in
 * luminance: against #1a1a2e the two options break even around 0.204, so every
 * mid-tone background in 0.204–0.5 got white text when dark text was clearly
 * better. The default primary #f56c5a sat right in that band, giving 2.93:1
 * where dark text scores 5.83:1 — below the 4.5:1 WCAG AA wants for body text,
 * on every primary button in the app. Comparing the two ratios directly is
 * exact and stays correct if either colour is ever changed.
 */
export function autoTextColor(bg: string): '#ffffff' | '#1a1a2e' {
  return contrastRatio(bg, DARK_TEXT) >= contrastRatio(bg, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
