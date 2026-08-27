/**
 * Make a picked photo small enough to be worth storing.
 *
 * The reason this exists is that the two platforms hand back very different
 * files. On native, expo-image-picker re-encodes at the `quality` given, so a
 * phone photo arrives already reduced. On web its implementation is a file
 * input and `quality` is ignored entirely — the original comes through
 * untouched, so a 12MP photo goes up at 4-5 MB. Web is where these pages are
 * actually built, which made it the worst case.
 *
 * Downscaling matters more for what readers pay than for what the bucket
 * costs: at 5 MB a hero photo is a slow page on a phone connection, and it
 * renders 600pt wide either way.
 */

/** Wider than any block draws, with room for a high-density screen. */
export const MAX_EDGE = 1600

/**
 * Files already this small are left exactly as they are.
 *
 * Re-encoding them would gain almost nothing and would flatten transparency
 * on a PNG, which is how a logo with a clear background comes back with a
 * black one.
 */
export const SKIP_UNDER_BYTES = 400 * 1024

/** Wide enough for a three-column grid on a dense screen, and no wider. */
export const THUMB_EDGE = 400

const JPEG_QUALITY = 0.75

export interface ShrinkOptions {
  /** Longest edge to fit within. */
  maxEdge?: number
  /** Files this small are returned untouched. Pass 0 to always redraw. */
  skipUnderBytes?: number
  quality?: number
}

/** Scale down to fit inside a square of `maxEdge`, never up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export interface ShrunkImage {
  blob: Blob
  contentType: string
}

/**
 * Return a smaller version of `blob`, or the original when there is nothing
 * to gain. Never throws: a photo that cannot be redrawn is still a photo
 * worth uploading.
 */
export async function shrinkImage(
  blob: Blob,
  contentType: string,
  options: ShrinkOptions = {}
): Promise<ShrunkImage> {
  const maxEdge = options.maxEdge ?? MAX_EDGE
  const skipUnder = options.skipUnderBytes ?? SKIP_UNDER_BYTES
  const quality = options.quality ?? JPEG_QUALITY

  // Native has no canvas, and the picker has already re-encoded the file
  // there. Checked by looking for the DOM rather than through Platform so
  // that this module stays free of react-native and can be unit tested —
  // vitest runs these without a React Native preset, by design.
  if (typeof document === 'undefined') return { blob, contentType }
  if (blob.size <= skipUnder) return { blob, contentType }

  try {
    const bitmap = await createImageBitmap(blob)
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return { blob, contentType }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const shrunk = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )

    // A picture that grew is one this made worse — some small images do.
    if (!shrunk || shrunk.size >= blob.size) return { blob, contentType }
    return { blob: shrunk, contentType: 'image/jpeg' }
  } catch {
    return { blob, contentType }
  }
}
