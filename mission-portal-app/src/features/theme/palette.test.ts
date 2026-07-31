import { describe, it, expect } from 'vitest'
import { paletteFromRGBA, SAMPLE_SIZE } from './palette'

/** Build an RGBA buffer from [r,g,b,a] pixels repeated `count` times each. */
function buffer(...runs: [number, number, number, number, number][]): number[] {
  const out: number[] = []
  for (const [r, g, b, a, count] of runs) {
    for (let i = 0; i < count; i++) out.push(r, g, b, a)
  }
  return out
}

describe('paletteFromRGBA', () => {
  it('returns the single colour of a flat image', () => {
    expect(paletteFromRGBA(buffer([255, 0, 0, 255, 16]))).toEqual(['#ff0000'])
  })

  it('orders swatches by how much of the image they cover', () => {
    const colors = paletteFromRGBA(
      buffer([0, 0, 255, 255, 3], [255, 0, 0, 255, 20], [0, 255, 0, 255, 10])
    )

    expect(colors).toEqual(['#ff0000', '#00ff00', '#0000ff'])
  })

  it('skips transparent pixels', () => {
    // Alpha below 128 is not part of the image, so a fully transparent red
    // must not show up as a swatch.
    const colors = paletteFromRGBA(buffer([255, 0, 0, 0, 50], [0, 0, 255, 255, 4]))

    expect(colors).toEqual(['#0000ff'])
  })

  it('collapses near-identical colours into one swatch', () => {
    // Two reds a couple of steps apart are the same colour to a viewer; the
    // distance threshold exists so the palette does not fill up with them.
    const colors = paletteFromRGBA(buffer([255, 0, 0, 255, 10], [253, 2, 1, 255, 10]))

    expect(colors).toHaveLength(1)
  })

  it('keeps colours that are far enough apart', () => {
    const colors = paletteFromRGBA(buffer([255, 0, 0, 255, 10], [0, 0, 255, 255, 10]))

    expect(colors).toHaveLength(2)
  })

  it('never returns more than eight swatches', () => {
    const runs = Array.from(
      { length: 20 },
      (_, i) =>
        [(i * 12) % 256, (i * 37) % 256, (i * 53) % 256, 255, 5] as [
          number,
          number,
          number,
          number,
          number,
        ]
    )
    const colors = paletteFromRGBA(buffer(...runs))

    expect(colors.length).toBeLessThanOrEqual(8)
  })

  it('returns nothing for an empty buffer', () => {
    expect(paletteFromRGBA([])).toEqual([])
  })

  it('emits lowercase six-digit hex, padded', () => {
    // A channel below 16 must not collapse to a five-character string.
    const colors = paletteFromRGBA(buffer([1, 2, 3, 255, 8]))

    expect(colors[0]).toBe('#010203')
    colors.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/))
  })

  it('exports the sample size the extractors downscale to', () => {
    // Both the web canvas and the native WebView bridge draw to this square,
    // so it has to stay a single shared constant.
    expect(SAMPLE_SIZE).toBe(64)
  })
})
