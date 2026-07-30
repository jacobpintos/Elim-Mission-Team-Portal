/**
 * The palette algorithm, shared by every platform.
 *
 * Only the *decode* of a photo into pixels differs across platforms — web has
 * a canvas, native borrows one from a WebView — so the bucketing lives here
 * and both paths feed it the same 64x64 RGBA buffer. Keeping it in one place
 * is what stops the two platforms drifting into producing different swatches
 * from the same photo.
 */

/** Edge length of the square the photo is downscaled to before bucketing. */
export const SAMPLE_SIZE = 64

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

/**
 * Bucket pixels into coarse RGB bins, then pick the most frequent buckets that
 * are sufficiently distinct from each other.
 *
 * @param data RGBA pixel data, 4 bytes per pixel.
 */
export function paletteFromRGBA(data: ArrayLike<number>): string[] {
  // Bucket by top 4 bits per channel, averaging the real pixel values in
  // each bucket so the swatch matches the photo rather than the bin center.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n++
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  const ranked = [...buckets.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number], n: b.n }))
    .sort((a, b) => b.n - a.n)

  const picked: [number, number, number][] = []
  for (const { rgb } of ranked) {
    if (picked.length >= 8) break
    if (picked.every((p) => colorDistance(p, rgb) > 60)) picked.push(rgb)
  }

  return picked.map(([r, g, b]) => rgbToHex(r, g, b))
}
