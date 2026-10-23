import type { ReactNode } from 'react'
import { ImageBackground, Platform, View } from 'react-native'
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg'
import { Text, XStack, YStack } from 'tamagui'

/**
 * The pieces of the Elim look shared by the public pages that are designed
 * rather than built from blocks — the Elim Store and the drafts of Giving,
 * Connect and Our Story.
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

/** The small, widely spaced label that names a section before its heading does. */
export function Overline({ children, color }: { children: string; color: string }) {
  return (
    <Text fontSize={12} fontWeight="800" letterSpacing={3} color={color}>
      {children.toUpperCase()}
    </Text>
  )
}

/**
 * A dark wash over a photograph, heavier toward the words at the bottom.
 *
 * Sized outright, not by its position. An <svg> is a replaced element: given
 * only top/left/right/bottom it keeps its default 300 by 150, so the wash
 * covered the top-left corner of the header and the heading ran on into the
 * photograph — white text over a white logo, gone. Heavy enough throughout
 * that a bright picture still reads as a dark band.
 */
export function Scrim() {
  return (
    <Svg
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Defs>
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity={0.62} />
          <Stop offset="0.5" stopColor={INK} stopOpacity={0.8} />
          <Stop offset="1" stopColor={INK} stopOpacity={0.94} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
    </Svg>
  )
}

/**
 * The dark band a designed page opens with.
 *
 * The page's own header photograph under the scrim when it has one; the
 * logo's mark, large and faint, when it does not, so the band is never a flat
 * slab. The mark and the page's name sit over the heading — the name only
 * when the heading is not already saying it. Whatever the page wants under
 * the words (its buttons) is passed as children.
 */
export function BrandHero({
  label,
  heading,
  subheading,
  bgImage,
  primary,
  wide,
  gutter,
  extraBottom = 0,
  aside,
  children,
}: {
  label: string
  heading: string
  subheading?: string
  bgImage?: string | null
  primary: string
  wide: boolean
  gutter: number
  /** Room left at the bottom for a panel lifted over the band's edge. */
  extraBottom?: number
  /**
   * A picture shown as it is rather than under the wash: beside the words on a
   * wide screen, under them on a narrow one. Our Story's photograph of the
   * people it is about, whose faces a wash would darken.
   */
  aside?: ReactNode
  children?: ReactNode
}) {
  const words = (
    <>
      <XStack alignItems="center" gap={12}>
        <BrandMark color={primary} height={18} />
        {heading.trim().toLowerCase() !== label.toLowerCase() ? (
          <>
            <View style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <Overline color={primary}>{label}</Overline>
          </>
        ) : null}
      </XStack>
      <Text
        color="#ffffff"
        fontSize={wide ? 60 : 40}
        lineHeight={wide ? 64 : 44}
        fontWeight="900"
        letterSpacing={wide ? -1.5 : -1}
        maxWidth={760}
      >
        {heading}
      </Text>
      {subheading ? (
        <Text
          color="rgba(255,255,255,0.8)"
          fontSize={wide ? 19 : 17}
          lineHeight={wide ? 30 : 27}
          maxWidth={600}
        >
          {subheading}
        </Text>
      ) : null}
      {children}
    </>
  )

  const content = (
    <YStack
      width="100%"
      maxWidth={1040}
      alignSelf="center"
      paddingHorizontal={gutter}
      paddingTop={wide ? 88 : 56}
      paddingBottom={(wide ? 72 : 56) + extraBottom}
      gap={18}
    >
      {aside ? (
        <XStack
          flexDirection={wide ? 'row' : 'column'}
          alignItems={wide ? 'center' : 'stretch'}
          gap={wide ? 56 : 32}
        >
          <YStack flex={wide ? 1 : undefined} gap={18}>
            {words}
          </YStack>
          {aside}
        </XStack>
      ) : (
        words
      )}
    </YStack>
  )

  if (bgImage) {
    return (
      <ImageBackground
        source={{ uri: bgImage }}
        resizeMode="cover"
        style={{ width: '100%', backgroundColor: INK, overflow: 'hidden' }}
      >
        <Scrim />
        {content}
      </ImageBackground>
    )
  }
  return (
    <View style={{ width: '100%', backgroundColor: INK, overflow: 'hidden' }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: wide ? -60 : -150, bottom: -50, opacity: 0.06 }}
      >
        <BrandMark color={primary} height={wide ? 340 : 240} />
      </View>
      {content}
    </View>
  )
}
