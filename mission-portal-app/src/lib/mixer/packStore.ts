import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Pack } from './inEars'
import { SWAP_HOURS } from './swaps'

/**
 * The in-ear pack chosen on this phone (Worship → In-ear Adjustment), kept for
 * a service: 12 hours, as a pack swap is (./swaps), since packs go to
 * whoever is playing that day.
 */

const KEY = 'inears.pack'

interface Kept extends Pack {
  at: number
}

/** The pack kept, if it was chosen within the last 12 hours. */
export function packStill(kept: unknown, now: number): Pack | null {
  const k = kept as Partial<Kept> | null
  if (!k || typeof k.bus !== 'number' || typeof k.at !== 'number') return null
  if (now - k.at > SWAP_HOURS * 60 * 60 * 1000) return null
  return { bus: k.bus, name: typeof k.name === 'string' ? k.name : '' }
}

export async function loadPack(now = Date.now()): Promise<Pack | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null)
  try {
    return packStill(raw ? JSON.parse(raw) : null, now)
  } catch {
    return null
  }
}

export async function savePack(pack: Pack | null, now = Date.now()): Promise<void> {
  await (
    pack
      ? AsyncStorage.setItem(KEY, JSON.stringify({ ...pack, at: now }))
      : AsyncStorage.removeItem(KEY)
  ).catch(() => {})
}
