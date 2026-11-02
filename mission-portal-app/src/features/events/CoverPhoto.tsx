import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'

/** The widest and the tallest a cover is drawn: a banner, and a flyer. */
const WIDEST = 3
const TALLEST = 0.75
/** Taller than this on a wide screen, it is fitted inside rather than towering over the page. */
const MAX_HEIGHT = 560

/**
 * An event's cover photo at its own shape — a flyer as a flyer, a banner as a
 * banner — so nothing in it is cut off: a photo cropped to one shape lost the
 * top and bottom of a poster. Its shape is read as it loads (16:9 until then).
 * Past the shapes above, or taller than the page should give it, it is fitted
 * whole over a blurred copy of itself rather than cropped.
 */
export function CoverPhoto({
  uri,
  label,
  radius = 0,
}: {
  uri: string
  label: string
  radius?: number
}) {
  const [shape, setShape] = useState<number | null>(null)
  const ratio = shape ? Math.min(WIDEST, Math.max(TALLEST, shape)) : 16 / 9
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: ratio,
        maxHeight: MAX_HEIGHT,
        overflow: 'hidden',
        borderRadius: radius,
        backgroundColor: '#11111b',
      }}
    >
      {/* What a fitted photo leaves either side of itself: itself, blurred. */}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        accessibilityLabel={label}
        onLoad={(e) => {
          const { width, height } = e.source
          if (width > 0 && height > 0) setShape(width / height)
        }}
      />
    </View>
  )
}
