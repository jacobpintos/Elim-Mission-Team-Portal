import type { ReactElement } from 'react'

export interface ColorExtraction {
  /** Resolve a photo (as a data URL) into up to 8 hex swatches. */
  extract: (dataUrl: string) => Promise<string[]>
  /**
   * An element the caller must render for {@link extract} to work. Null on
   * web, where the canvas is offscreen and needs no host.
   */
  bridge: ReactElement | null
}
