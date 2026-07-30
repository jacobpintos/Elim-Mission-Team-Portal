import { useCallback } from 'react'
import { SAMPLE_SIZE, paletteFromRGBA } from './palette'
import type { ColorExtraction } from './useColorExtraction.types'

/**
 * Web implementation: draw the photo onto an offscreen canvas and read the
 * pixels back directly. Nothing to render, so `bridge` is null.
 */
export function useColorExtraction(): ColorExtraction {
  const extract = useCallback(async (dataUrl: string): Promise<string[]> => {
    const img = new window.Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    return paletteFromRGBA(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data)
  }, [])

  return { extract, bridge: null }
}
