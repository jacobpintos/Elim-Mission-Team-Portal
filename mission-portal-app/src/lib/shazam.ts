import { requireOptionalNativeModule } from 'expo'

/** A recording Shazam recognised. */
export interface ShazamHit {
  title?: string
  artist?: string
}

interface ShazamMatchModule {
  isAvailable(): boolean
  /** Listens until a match, a sure no-match, or `timeoutSeconds`. */
  match(timeoutSeconds: number): Promise<ShazamHit | null>
  cancel(): void
}

/**
 * ShazamKit, on an iPhone build that has it (iOS 17 and later). Null on the
 * web, on Android, and on a build made before it was added — so callers fall
 * back to listening for the words.
 */
const native = requireOptionalNativeModule<ShazamMatchModule>('ShazamMatch')

export const shazam = native && native.isAvailable() ? native : null
