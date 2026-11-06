import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Where the video switcher is on its network: the ATEM's IP address (ATEM
 * Setup, or the switcher's own menu). Kept on this phone, set in
 * Settings → Video switcher.
 */

const KEY = 'switcher.address'

let cached: string | null | undefined

/** The address saved on this phone, or '' if none is. */
export async function loadSwitcherAddress(): Promise<string> {
  if (cached === undefined) cached = await AsyncStorage.getItem(KEY).catch(() => null)
  return cached ?? ''
}

export async function saveSwitcherAddress(address: string): Promise<void> {
  cached = address
  await (address ? AsyncStorage.setItem(KEY, address) : AsyncStorage.removeItem(KEY)).catch(
    () => {}
  )
}

/** The multiview's picture, from a video encoder on the same network (./multiview). */
export interface MultiviewFeed {
  url: string
  /** A still picture the encoder updates (asked for again and again), or a motion-JPEG stream. */
  kind: 'still' | 'mjpeg'
}

const FEED_KEY = 'switcher.multiview'

export async function loadMultiviewFeed(): Promise<MultiviewFeed | null> {
  const raw = await AsyncStorage.getItem(FEED_KEY).catch(() => null)
  if (!raw) return null
  try {
    const f = JSON.parse(raw) as Partial<MultiviewFeed>
    return typeof f.url === 'string' && (f.kind === 'still' || f.kind === 'mjpeg')
      ? { url: f.url, kind: f.kind }
      : null
  } catch {
    return null
  }
}

export async function saveMultiviewFeed(feed: MultiviewFeed | null): Promise<void> {
  await (
    feed ? AsyncStorage.setItem(FEED_KEY, JSON.stringify(feed)) : AsyncStorage.removeItem(FEED_KEY)
  ).catch(() => {})
}
