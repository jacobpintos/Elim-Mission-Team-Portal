export { luminance, autoTextColor, contrastRatio } from '@/theme/contrast'
import { luminance } from '@/theme/contrast'

export function computeTextColor(hexBg: string): string {
  return luminance(hexBg) < 0.4 ? '#f0ece4' : '#1a1a2e'
}
