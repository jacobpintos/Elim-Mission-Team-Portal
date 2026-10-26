import Svg, { Path, Rect } from 'react-native-svg'
import type { Brand } from '@/lib/socialIcon'

/**
 * A platform's own logo, as its app icon shows it, filling a square that the
 * caller rounds or circles: Venmo's white V on its blue, Cash App's white $ on
 * its green.
 *
 * Drawn here because @tamagui/lucide-icons can't be used with this app's
 * tamagui (page-builder SocialBlock). The V is Material Design Icons' venmo
 * (Apache 2.0); the $ is cut from Simple Icons' cashapp (CC0); the colours
 * are Simple Icons' from each brand's own pages.
 */

export const BRAND_COLORS: Record<Brand, string> = {
  venmo: '#008CFF',
  cashapp: '#00C244',
}

const MARKS: Record<Brand, { d: string; pad: number }> = {
  venmo: {
    d: 'M19.5 3c.64 1.08.94 2.19.94 3.6c0 4.48-3.83 10.31-6.94 14.4H6.41L3.56 4l6.21-.61l1.51 12.11c1.41-2.29 3.14-5.89 3.14-8.34c0-1.35-.23-2.26-.59-3.01L19.5 3z',
    pad: 4.7,
  },
  cashapp: {
    d: 'M17.42 8.105l-.93.93a.5.5 0 01-.67.01 5 5 0 00-3.22-1.18c-.97 0-1.94.32-1.94 1.21 0 .9 1.04 1.2 2.24 1.65 2.1.7 3.84 1.58 3.84 3.64 0 2.24-1.74 3.78-4.58 3.95l-.26 1.2a.49.49 0 01-.48.39H9.63l-.09-.01a.5.5 0 01-.38-.59l.28-1.27a6.54 6.54 0 01-2.88-1.57v-.01a.48.48 0 010-.68l1-.97a.49.49 0 01.67 0c.91.86 2.13 1.34 3.39 1.32 1.3 0 2.17-.55 2.17-1.42 0-.87-.88-1.1-2.54-1.72-1.76-.63-3.43-1.52-3.43-3.6 0-2.42 2.01-3.6 4.39-3.71l.25-1.23a.48.48 0 01.48-.38h1.78l.1.01c.26.06.43.31.37.57l-.27 1.37c.9.3 1.75.77 2.48 1.39l.02.02c.19.2.19.5 0 .68z',
    pad: 2.8,
  },
}

export function BrandMark({ brand, size }: { brand: Brand; size: number }) {
  const { d, pad } = MARKS[brand]
  // The mark is drawn in a 24-square; the padding around it sets how much of
  // the tile it fills, as on the platform's own icon.
  const side = 24 + pad * 2
  return (
    <Svg width={size} height={size} viewBox={`${-pad} ${-pad} ${side} ${side}`}>
      <Rect x={-pad} y={-pad} width={side} height={side} fill={BRAND_COLORS[brand]} />
      <Path d={d} fill="#FFFFFF" />
    </Svg>
  )
}
