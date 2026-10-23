import type { ImageSourcePropType } from 'react-native'

/**
 * The store's own product photos, shipped with the app (assets/store).
 *
 * They are what the featured clothing shows until an admin replaces a photo
 * with an upload or an address. Content refers to them as `bundled:<name>`,
 * because a saved document can hold a name but not a bundled file.
 */
const BUNDLED: Record<string, ImageSourcePropType> = {
  'god-is-able-tee': require('../../../assets/store/god-is-able-tee.jpg'),
  'john-1-5-lightbulb-tee': require('../../../assets/store/john-1-5-lightbulb-tee.jpg'),
  'i-belong-to-jesus-longsleeve': require('../../../assets/store/i-belong-to-jesus-longsleeve.jpg'),
  'god-is-able-hat': require('../../../assets/store/god-is-able-hat.jpg'),
  'yeshua-tee': require('../../../assets/store/yeshua-tee.jpg'),
  'i-am-gods-idea-tee': require('../../../assets/store/i-am-gods-idea-tee.jpg'),
}

/** What to hand an image component for an item's photo, or null if there is none. */
export function storeImageSource(image: string): ImageSourcePropType | { uri: string } | null {
  if (!image) return null
  if (image.startsWith('bundled:')) return BUNDLED[image.slice('bundled:'.length)] ?? null
  return { uri: image }
}

/** Whether a photo is one of the shipped ones, which an address field cannot show. */
export const isBundledImage = (image: string) => image.startsWith('bundled:')
