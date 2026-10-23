import { Platform } from 'react-native'
import Svg, { Polygon, Rect } from 'react-native-svg'

/**
 * The pieces of the Elim look shared by the public pages that are designed
 * rather than built from blocks — Draft Giving and the Elim Store.
 */

/** Near-black, leaning toward the app's navy: the ground of their dark bands. */
export const INK = '#11111b'

/** A serif that every platform has, for verses and the store's name. */
export const SERIF = Platform.select({
  web: 'Georgia, "Times New Roman", serif',
  ios: 'Georgia',
  default: 'serif',
})

/** The logo's mark — two chevrons and an E — drawn so it takes any colour. */
export function BrandMark({ color, height }: { color: string; height: number }) {
  return (
    <Svg width={(height * 480) / 260} height={height} viewBox="270 420 480 260">
      <Polygon points="275,422 318,422 430,549 318,677 275,677 387,549" fill={color} />
      <Polygon points="372,422 415,422 528,549 415,677 372,677 485,549" fill={color} />
      <Rect x={553} y={422} width={55} height={255} fill={color} />
      <Rect x={553} y={422} width={192} height={46} fill={color} />
      <Rect x={553} y={523} width={180} height={44} fill={color} />
      <Rect x={553} y={630} width={192} height={47} fill={color} />
    </Svg>
  )
}

/** A right arrow, for links and buttons that go somewhere. */
export function Arrow({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Polygon points="2,7 11,7 7.5,3.5 9,2 15,8 9,14 7.5,12.5 11,9 2,9" fill={color} />
    </Svg>
  )
}
