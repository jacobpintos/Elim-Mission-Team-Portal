import { Image, Platform, type ImageStyle, type StyleProp } from 'react-native'

interface ImgProps {
  src?: string | null
  alt?: string
  // Accepts the same style objects the previous raw <img> tags used, which may
  // contain web-only properties (objectFit, display, filter, …) and come from
  // StyleSheet.create (typed loosely as `object`). On native the web-only keys
  // are stripped and objectFit is translated to resizeMode.
  style?: any
}

// Web-only style properties that React Native's <Image> does not understand
// (and which trigger warnings / invalid-style errors if passed through).
const WEB_ONLY_STYLE_KEYS = ['objectFit', 'objectPosition', 'display', 'filter', 'mixBlendMode']

/**
 * Cross-platform image.
 *
 * React Native has no `img` host component, so rendering a raw <img> on native
 * throws "View config getter callback for component `img` must be a function"
 * and hard-crashes the app. This renders a real <img> on web (unchanged
 * behaviour) and a react-native <Image> on native.
 */
export function Img({ src, alt, style }: ImgProps) {
  if (!src) return null

  if (Platform.OS === 'web') {
    const Tag = 'img' as any
    return <Tag src={src} alt={alt ?? ''} style={style} />
  }

  const source = style ?? {}
  const objectFit = source.objectFit as string | undefined
  const resizeMode =
    objectFit === 'contain' ? 'contain' : objectFit === 'fill' ? 'stretch' : 'cover'

  const nativeStyle: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if (!WEB_ONLY_STYLE_KEYS.includes(key)) nativeStyle[key] = source[key]
  }

  return (
    <Image
      source={{ uri: src }}
      style={nativeStyle as StyleProp<ImageStyle>}
      resizeMode={resizeMode}
      accessibilityLabel={alt}
    />
  )
}
